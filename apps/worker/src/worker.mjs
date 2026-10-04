import { hostname } from 'node:os';
import process from 'node:process';

import pg from 'pg';

import { claimPlanningRequest, processPlanningRequest } from './planning-processor.mjs';
import { claimAutomationProject, processAutomationProject } from './work-processor.mjs';

const { Pool } = pg;
const once = process.argv.includes('--once');
const workerKey = `${hostname()}:${process.pid}`;
const version = 'stagepilot-core-automation-v1';
const pollMs = Math.max(1000, Number(process.env.STAGEPILOT_WORKER_POLL_MS ?? 3000));
let stopping = false;
let currentJob = null;
let lastError = null;

function emit(event, data = {}) {
    process.stdout.write(`${JSON.stringify({
        ok: event !== 'error',
        service: 'stagepilot-worker',
        version,
        workerKey,
        event,
        at: new Date().toISOString(),
        ...data
    })}\n`);
}

if (!process.env.DATABASE_URL) {
    emit('health', {
        mode: once ? 'once' : 'idle',
        databaseConfigured: false,
        message: 'DATABASE_URL missing; automation loop not started.'
    });
    if (once) process.exit(0);
    process.exit(1);
}

const db = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: Math.max(2, Number(process.env.STAGEPILOT_WORKER_DB_POOL_SIZE ?? 4)),
    application_name: 'stagepilot-worker'
});

async function heartbeat(status = 'ready') {
    await db.query(
        `INSERT INTO worker_heartbeats (
            worker_key, worker_version, status, current_job, last_error,
            started_at, heartbeat_at
         ) VALUES ($1, $2, $3, $4::jsonb, $5, now(), now())
         ON CONFLICT (worker_key) DO UPDATE SET
            worker_version = EXCLUDED.worker_version,
            status = EXCLUDED.status,
            current_job = EXCLUDED.current_job,
            last_error = EXCLUDED.last_error,
            heartbeat_at = now()`,
        [workerKey, version, status, JSON.stringify(currentJob ?? {}), lastError]
    );
}

async function recoverStaleClaims() {
    await db.query(
        `WITH recovered AS (
            UPDATE prompt_requests
            SET status = CASE
                    WHEN status = 'processing'
                     AND send_attempts < 3
                     AND COALESCE(context_json->>'transportStage', 'worker_claimed') IN (
                         'worker_claimed', 'context_loading', 'context_ready',
                         'browser_starting', 'browser_ready',
                         'target_opening', 'target_opened',
                         'project_creating', 'project_created',
                         'new_chat_opening', 'new_chat_opened',
                         'composer_drafting', 'composer_ready'
                     )
                    THEN 'retry'
                    ELSE 'failed'
                END,
                completed_at = CASE
                    WHEN status = 'processing'
                     AND send_attempts < 3
                     AND COALESCE(context_json->>'transportStage', 'worker_claimed') IN (
                         'worker_claimed', 'context_loading', 'context_ready',
                         'browser_starting', 'browser_ready',
                         'target_opening', 'target_opened',
                         'project_creating', 'project_created',
                         'new_chat_opening', 'new_chat_opened',
                         'composer_drafting', 'composer_ready'
                     )
                    THEN NULL
                    ELSE now()
                END,
                next_attempt_at = CASE
                    WHEN status = 'processing'
                     AND send_attempts < 3
                     AND COALESCE(context_json->>'transportStage', 'worker_claimed') IN (
                         'worker_claimed', 'context_loading', 'context_ready',
                         'browser_starting', 'browser_ready',
                         'target_opening', 'target_opened',
                         'project_creating', 'project_created',
                         'new_chat_opening', 'new_chat_opened',
                         'composer_drafting', 'composer_ready'
                     )
                    THEN now()
                    ELSE NULL
                END,
                claimed_at = NULL,
                claimed_by = NULL,
                last_error = CASE
                    WHEN status = 'processing'
                     AND send_attempts < 3
                     AND COALESCE(context_json->>'transportStage', 'worker_claimed') IN (
                         'worker_claimed', 'context_loading', 'context_ready',
                         'browser_starting', 'browser_ready',
                         'target_opening', 'target_opened',
                         'project_creating', 'project_created',
                         'new_chat_opening', 'new_chat_opened',
                         'composer_drafting', 'composer_ready'
                     )
                    THEN 'WORKER_INTERRUPTED_BEFORE_SEND_SAFE_RETRY'
                    ELSE 'WORKER_INTERRUPTED_AFTER_POSSIBLE_SEND_MANUAL_REVIEW_REQUIRED'
                END,
                context_json = COALESCE(context_json, '{}'::jsonb) || jsonb_build_object(
                    'transportStage', CASE
                        WHEN status = 'processing'
                         AND send_attempts < 3
                         AND COALESCE(context_json->>'transportStage', 'worker_claimed') IN (
                             'worker_claimed', 'context_loading', 'context_ready',
                             'browser_starting', 'browser_ready',
                             'target_opening', 'target_opened',
                             'project_creating', 'project_created',
                             'new_chat_opening', 'new_chat_opened',
                             'composer_drafting', 'composer_ready'
                         )
                        THEN 'retry'
                        ELSE 'failed'
                    END,
                    'transportUpdatedAt', now()::text,
                    'automaticRetry', CASE
                        WHEN status = 'processing'
                         AND send_attempts < 3
                         AND COALESCE(context_json->>'transportStage', 'worker_claimed') IN (
                             'worker_claimed', 'context_loading', 'context_ready',
                             'browser_starting', 'browser_ready',
                             'target_opening', 'target_opened',
                             'project_creating', 'project_created',
                             'new_chat_opening', 'new_chat_opened',
                             'composer_drafting', 'composer_ready'
                         )
                        THEN true
                        ELSE false
                    END
                )
            WHERE request_type IN (
                'project_plan', 'project_proposal', 'project_plan_tree'
            )
              AND status IN ('processing', 'sent', 'waiting_response')
              AND claimed_at < now() - interval '30 minutes'
            RETURNING id, project_id, status, send_attempts
         )
         INSERT INTO events (
            project_id, entity_type, entity_id, event_type, severity,
            actor_type, actor_id, message, data
         )
         SELECT project_id, 'prompt_request', id::text,
                'planning.request.recovered', 'warning', 'worker', $1,
                CASE WHEN status = 'retry'
                    THEN 'چرخه ChatGPT پیش از مرحله ارسال متوقف شده بود و با ایمنی بازیابی شد.'
                    ELSE 'به‌علت احتمال ارسال قبلی، تکرار خودکار ممنوع و چرخه برای بررسی دستی متوقف شد.'
                END,
                jsonb_build_object('status', status, 'sendAttempts', send_attempts)
         FROM recovered`,
        [workerKey]
    );
    await db.query(
        `UPDATE project_automation_state
         SET status = 'queued', lease_owner = NULL, lease_expires_at = NULL,
             last_error = COALESCE(last_error, 'WORKER_LEASE_RECOVERED'), updated_at = now()
         WHERE status IN ('running', 'waiting_ai', 'executing', 'testing', 'git_sync')
           AND lease_expires_at < now()`
    );
}

async function processOne() {
    const planning = await claimPlanningRequest(db, workerKey);
    if (planning) {
        currentJob = { type: planning.request_type, id: planning.id, projectId: planning.project_id };
        await heartbeat('busy');
        const result = await processPlanningRequest(db, planning);
        emit('planning.completed', result);
        currentJob = null;
        lastError = null;
        return true;
    }

    const automation = await claimAutomationProject(db, workerKey);
    if (automation) {
        currentJob = { type: 'project_automation', projectId: automation.project_id };
        await heartbeat('busy');
        try {
            const result = await processAutomationProject(db, automation);
            emit('automation.cycle.completed', result);
            currentJob = null;
            lastError = null;
            return true;
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            await db.query(
                `UPDATE project_automation_state
                 SET status = CASE WHEN status = 'queued' THEN status ELSE 'blocked' END,
                     last_error = $2, lease_owner = NULL, lease_expires_at = NULL,
                     updated_at = now()
                 WHERE project_id = $1::uuid
                   AND status NOT IN ('queued', 'failed', 'completed', 'paused')`,
                [automation.project_id, message.slice(0, 4000)]
            );
            throw error;
        }
    }
    return false;
}

async function tick() {
    try {
        const processed = await processOne();
        await heartbeat(processed ? 'ready' : 'idle');
        return processed;
    } catch (error) {
        lastError = error instanceof Error ? error.stack ?? error.message : String(error);
        emit('error', { error: lastError });
        await heartbeat('error').catch(() => {});
        currentJob = null;
        return false;
    }
}

async function main() {
    await db.query('SELECT 1');
    await recoverStaleClaims();
    await heartbeat('ready');
    emit('started', { pollMs, databaseConfigured: true, once });

    if (once) {
        await tick();
        await db.end();
        return;
    }

    while (!stopping) {
        const processed = await tick();
        if (!processed) await new Promise(resolve => setTimeout(resolve, pollMs));
    }
    await heartbeat('stopped').catch(() => {});
    await db.end();
}

process.on('SIGTERM', () => { stopping = true; });
process.on('SIGINT', () => { stopping = true; });

main().catch(error => {
    emit('error', { error: error instanceof Error ? error.stack : String(error) });
    process.exitCode = 1;
});

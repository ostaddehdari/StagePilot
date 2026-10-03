import { randomUUID } from 'node:crypto';

import { parseManagerResponse } from '../manager/response-parser.mjs';
import { sendPromptAndWait } from './browser-transport.mjs';
import { commitAndPush, executeScripts, runProcess, runVerification } from './process-runner.mjs';
import { ensureProjectRepository } from './repository-provisioner.mjs';

function cleanJsonResponse(value) {
    const text = String(value ?? '').trim();
    const fenced = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
    return fenced ? fenced[1].trim() : text;
}

export async function claimAutomationProject(db, workerKey) {
    const result = await db.query(
        `UPDATE project_automation_state state
         SET status = 'running', lease_owner = $1,
             lease_expires_at = now() + interval '30 minutes',
             last_heartbeat_at = now(), updated_at = now()
         WHERE state.project_id = (
            SELECT project_id
            FROM project_automation_state
            WHERE status IN ('queued', 'running')
              AND (lease_expires_at IS NULL OR lease_expires_at < now() OR lease_owner = $1)
            ORDER BY updated_at
            FOR UPDATE SKIP LOCKED
            LIMIT 1
         )
         RETURNING state.*`,
        [workerKey]
    );
    return result.rows[0] ?? null;
}

async function projectSnapshot(db, projectId) {
    const result = await db.query(
        `SELECT p.id, p.name, p.slug, p.description, p.settings,
                p.current_plan_revision,
                a.id AS account_id, a.profile_key,
                c.id AS conversation_id, c.external_url,
                c.external_chat_id, c.sequence_no
         FROM projects p
         LEFT JOIN chat_accounts a ON a.id = p.selected_chat_account_id
         LEFT JOIN LATERAL (
            SELECT * FROM conversations
            WHERE project_id = p.id AND status IN ('active', 'pending_creation')
            ORDER BY sequence_no DESC LIMIT 1
         ) c ON true
         WHERE p.id = $1::uuid AND p.deleted_at IS NULL`,
        [projectId]
    );
    if (result.rowCount !== 1) throw new Error('AUTOMATION_PROJECT_NOT_FOUND');
    return result.rows[0];
}

async function selectNextWork(db, project) {
    const result = await db.query(
        `SELECT w.*, s.project_id, s.stage_key, s.title AS stage_title,
                s.description AS stage_description, s.position AS stage_position,
                s.acceptance_criteria AS stage_acceptance_criteria
         FROM works w
         JOIN stages s ON s.id = w.stage_id
         WHERE s.project_id = $1::uuid
           AND s.revision = $2
         ORDER BY s.position, w.position`,
        [project.id, project.current_plan_revision]
    );
    const rows = result.rows;
    const completed = new Set(rows.filter(row => row.status === 'completed').map(row => row.work_key));
    const candidate = rows.find(row => {
        if (!['pending', 'ready', 'failed'].includes(row.status)) return false;
        const dependencies = Array.isArray(row.dependencies) ? row.dependencies : [];
        return dependencies.every(key => completed.has(key));
    });
    return {
        work: candidate ?? null,
        total: rows.length,
        completed: completed.size,
        blocked: rows.filter(row => !['completed', 'running'].includes(row.status)).length > 0
    };
}

async function maybeRolloverConversation(db, project, workspacePath) {
    if (!project.account_id) throw new Error('PROJECT_CHAT_ACCOUNT_REQUIRED');
    const maximum = Number(process.env.STAGEPILOT_MAX_PROMPTS_PER_CONVERSATION ?? 35);
    const count = project.conversation_id
        ? await db.query(
            `SELECT COUNT(*)::integer AS count
             FROM prompt_requests
             WHERE conversation_id = $1::uuid AND status = 'completed'`,
            [project.conversation_id]
        )
        : { rows: [{ count: maximum }] };
    if (project.conversation_id && Number(count.rows[0].count) < maximum) return project;

    const sequence = Number(project.sequence_no ?? 0) + 1;
    const result = await db.query(
        `WITH closed AS (
            UPDATE conversations SET status = 'closed', closed_at = now(),
                metadata = metadata || jsonb_build_object('closedReason', 'automatic_context_rollover')
            WHERE project_id = $1::uuid AND status IN ('active', 'pending_creation')
         )
         INSERT INTO conversations (
            project_id, chat_account_id, status, sequence_no, started_reason, metadata
         ) VALUES (
            $1::uuid, $2::uuid, 'pending_creation', $3,
            'automatic_context_rollover',
            jsonb_build_object('workspacePath', $4::text, 'recoveredFromGit', true)
         ) RETURNING id, external_url, external_chat_id, sequence_no`,
        [project.id, project.account_id, sequence, workspacePath]
    );
    return {
        ...project,
        conversation_id: result.rows[0].id,
        external_url: null,
        external_chat_id: null,
        sequence_no: sequence
    };
}

async function gitContext(workspacePath) {
    const [head, log, status] = await Promise.all([
        runProcess('git', ['rev-parse', 'HEAD'], { cwd: workspacePath, timeoutMs: 30_000 }),
        runProcess('git', ['log', '--oneline', '-8'], { cwd: workspacePath, timeoutMs: 30_000 }),
        runProcess('git', ['status', '--short'], { cwd: workspacePath, timeoutMs: 30_000 })
    ]);
    return {
        head: head.stdout.trim(),
        recentCommits: log.stdout.trim(),
        status: status.stdout.trim()
    };
}

function workPrompt({ project, work, attempt, runKey, git, previousFailure }) {
    const requestMarker = `stagepilot:${project.id}:${runKey}`;
    return {
        requestMarker,
        text: [
            'STAGEPILOT_AUTONOMOUS_WORK_PROTOCOL_V2',
            `PROJECT: ${project.name}`,
            `PROJECT_ID: ${project.id}`,
            `STAGE: ${work.stage_key} — ${work.stage_title}`,
            `WORK: ${work.work_key} — ${work.title}`,
            `ATTEMPT: ${attempt}`,
            `RUN_KEY: ${runKey}`,
            `OBJECTIVE:\n${work.description ?? ''}`,
            `WORK_ACCEPTANCE_CRITERIA:\n${JSON.stringify(work.acceptance_criteria ?? [])}`,
            `STAGE_ACCEPTANCE_CRITERIA:\n${JSON.stringify(work.stage_acceptance_criteria ?? [])}`,
            `VERIFIED_GIT_STATE:\nHEAD=${git.head}\nRECENT_COMMITS:\n${git.recentCommits}\nSTATUS:\n${git.status || '(clean)'}`,
            previousFailure ? `PREVIOUS_ATTEMPT_FAILURE:\n${previousFailure}` : '',
            `Return exactly one JSON object without Markdown fences:
{
  "responseType": "script_batch",
  "summary": "...",
  "scripts": [
    {
      "order": 1,
      "name": "run.sh",
      "language": "bash",
      "content": "#!/usr/bin/env bash\\nset -Eeuo pipefail\\n...",
      "dependsOn": []
    }
  ]
}
Rules:
1. Work inside the current repository directory available as $STAGEPILOT_WORKSPACE.
2. Implement only this Work and include or update tests.
3. Do not run git commit, git push, sudo, system shutdown, disk formatting, or edit system credential files.
4. Scripts must be deterministic and non-interactive; every filename must end in .sh.
5. If execution is unsafe or essential information is missing, return decision_required.
6. Do not claim success; StagePilot runs tests and Git verification after execution.
7. REQUEST_MARKER for your internal correlation is ${requestMarker}.`
        ].filter(Boolean).join('\n\n')
    };
}

async function storeLog(db, runId, stream, value) {
    const chunks = String(value ?? '').match(/[\s\S]{1,60000}/g) ?? [];
    for (let index = 0; index < chunks.length; index += 1) {
        await db.query(
            `INSERT INTO run_logs (run_id, stream, sequence_no, chunk)
             VALUES ($1::uuid, $2, $3, $4)
             ON CONFLICT (run_id, stream, sequence_no) DO NOTHING`,
            [runId, stream, index + 1, chunks[index]]
        );
    }
}

async function completeWork(db, { project, work, attemptRow, responseId, runId, execution, verification, gitResult }) {
    const client = await db.connect();
    try {
        await client.query('BEGIN');
        await client.query(
            `UPDATE works SET status = 'completed', completed_at = now(), updated_at = now(),
                metadata = metadata || jsonb_build_object(
                    'lastAutomationAttemptId', $2::uuid,
                    'commitSha', $3::text
                )
             WHERE id = $1::uuid`,
            [work.id, attemptRow.id, gitResult.commitSha]
        );
        await client.query(
            `UPDATE stages s SET status = CASE
                WHEN NOT EXISTS (
                    SELECT 1 FROM works w
                    WHERE w.stage_id = s.id AND w.status <> 'completed'
                ) THEN 'completed' ELSE 'running' END,
                completed_at = CASE WHEN NOT EXISTS (
                    SELECT 1 FROM works w
                    WHERE w.stage_id = s.id AND w.status <> 'completed'
                ) THEN now() ELSE NULL END,
                updated_at = now()
             WHERE s.id = $1::uuid`,
            [work.stage_id]
        );
        await client.query(
            `UPDATE project_automation_attempts
             SET status = 'completed', prompt_response_id = $2::uuid,
                 commit_sha = $3, completed_at = now(),
                 result_json = $4::jsonb
             WHERE id = $1::uuid`,
            [
                attemptRow.id,
                responseId,
                gitResult.commitSha,
                JSON.stringify({ execution, verification, git: gitResult })
            ]
        );
        await client.query(
            `UPDATE runs SET status = 'completed', exit_code = 0, finished_at = now(),
                 result_json = $2::jsonb
             WHERE id = $1::uuid`,
            [runId, JSON.stringify({ verification, git: gitResult })]
        );
        for (const [type, reference, details] of [
            ['implementation', attemptRow.run_key, { scripts: execution.outcomes.length }],
            ['test', attemptRow.run_key, { exitCode: verification.exitCode }],
            ['git', gitResult.commitSha ?? attemptRow.run_key, { pushed: true }]
        ]) {
            await client.query(
                `INSERT INTO work_completion_evidence (
                    project_id, stage_key, work_key, evidence_type,
                    status, reference, details
                 ) VALUES ($1::uuid, $2, $3, $4, 'passed', $5, $6::jsonb)`,
                [project.id, work.stage_key, work.work_key, type, reference, JSON.stringify(details)]
            );
        }
        await client.query(
            `UPDATE project_automation_state
             SET status = CASE WHEN status = 'paused' THEN 'paused' ELSE 'queued' END,
                 current_stage_id = NULL, current_work_id = NULL,
                 cycle_no = cycle_no + 1, lease_owner = NULL, lease_expires_at = NULL,
                 last_error = NULL, updated_at = now()
             WHERE project_id = $1::uuid`,
            [project.id]
        );
        await client.query('COMMIT');
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}

export async function processAutomationProject(db, state) {
    let project = await projectSnapshot(db, state.project_id);
    const repository = await ensureProjectRepository(db, project.id);
    const workspacePath = repository.workspace.workspace_path;
    project = await maybeRolloverConversation(db, project, workspacePath);
    const next = await selectNextWork(db, project);
    if (!next.work) {
        if (next.total === next.completed) {
            await db.query(
                `UPDATE project_automation_state
                 SET status = 'completed', completed_at = now(), lease_owner = NULL,
                     lease_expires_at = NULL, updated_at = now()
                 WHERE project_id = $1::uuid`,
                [project.id]
            );
            await db.query(
                `UPDATE projects SET status = 'completed', updated_at = now()
                 WHERE id = $1::uuid`,
                [project.id]
            );
            return { projectId: project.id, completed: true };
        }
        throw new Error('NO_READY_WORK_DEPENDENCIES_BLOCKED');
    }

    const work = next.work;
    const countResult = await db.query(
        `SELECT COUNT(*)::integer AS count,
                (array_agg(error_text ORDER BY attempt DESC))[1] AS last_error
         FROM project_automation_attempts
         WHERE work_id = $1::uuid`,
        [work.id]
    );
    const attempt = Number(countResult.rows[0].count) + 1;
    if (attempt > Number(state.max_work_attempts)) throw new Error('WORK_MAX_ATTEMPTS_EXCEEDED');
    const runKey = `${work.stage_key}-${work.work_key}-${attempt}-${Date.now()}`;
    const git = await gitContext(workspacePath);
    const prompt = workPrompt({
        project,
        work,
        attempt,
        runKey,
        git,
        previousFailure: countResult.rows[0].last_error
    });

    const client = await db.connect();
    let attemptRow;
    let promptRequest;
    let runId;
    try {
        await client.query('BEGIN');
        const promptResult = await client.query(
            `INSERT INTO prompt_requests (
                project_id, stage_id, work_id, conversation_id,
                request_key, request_type, prompt_text, context_json,
                state_revision, status, claimed_at, claimed_by, send_attempts
             ) VALUES (
                $1::uuid, $2::uuid, $3::uuid, $4::uuid,
                $5, 'work_execution', $6,
                jsonb_build_object('runKey', $5::text, 'requestMarker', $7::text),
                $8, 'processing', now(), $9, 1
             ) RETURNING *`,
            [
                project.id,
                work.stage_id,
                work.id,
                project.conversation_id,
                runKey,
                prompt.text,
                prompt.requestMarker,
                project.current_plan_revision,
                state.lease_owner
            ]
        );
        promptRequest = promptResult.rows[0];
        const attemptResult = await client.query(
            `INSERT INTO project_automation_attempts (
                project_id, stage_id, work_id, prompt_request_id,
                attempt, status, run_key, workspace_path
             ) VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5, 'prompting', $6, $7)
             RETURNING *`,
            [project.id, work.stage_id, work.id, promptRequest.id, attempt, runKey, workspacePath]
        );
        attemptRow = attemptResult.rows[0];
        runId = randomUUID();
        await client.query(
            `INSERT INTO runs (
                id, project_id, stage_id, work_id, run_key, attempt,
                target_server, workspace, status, started_at
             ) VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5, $6,
                       'stagepilot-managed-workspace', $7, 'running', now())`,
            [runId, project.id, work.stage_id, work.id, runKey, attempt, workspacePath]
        );
        await client.query(
            `UPDATE works SET status = 'running', started_at = COALESCE(started_at, now()), updated_at = now()
             WHERE id = $1::uuid`,
            [work.id]
        );
        await client.query(
            `UPDATE stages SET status = 'running', started_at = COALESCE(started_at, now()), updated_at = now()
             WHERE id = $1::uuid`,
            [work.stage_id]
        );
        await client.query(
            `UPDATE project_automation_state
             SET status = 'waiting_ai', current_stage_id = $2::uuid,
                 current_work_id = $3::uuid, updated_at = now()
             WHERE project_id = $1::uuid`,
            [project.id, work.stage_id, work.id]
        );
        await client.query('COMMIT');
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }

    try {
        const transport = await sendPromptAndWait({
            profileKey: project.profile_key,
            accountId: project.account_id,
            conversationUrl: project.external_url,
            operationId: `work:${promptRequest.id}`,
            promptText: prompt.text,
            timeoutMs: Number(process.env.STAGEPILOT_AI_RESPONSE_TIMEOUT_MS ?? 240_000)
        });
        const rawText = cleanJsonResponse(transport.text);
        const parsed = parseManagerResponse(rawText, { batchKey: runKey });
        const responseResult = await db.query(
            `INSERT INTO prompt_responses (
                prompt_request_id, response_type, raw_text, parsed_json,
                extraction_status, is_complete
             ) VALUES ($1::uuid, $2, $3, $4::jsonb, 'validated', true)
             RETURNING id`,
            [promptRequest.id, parsed.responseType, rawText, JSON.stringify(parsed.envelope)]
        );
        await db.query(
            `UPDATE prompt_requests SET status = 'completed', completed_at = now(),
                 context_json = context_json || jsonb_build_object('conversationUrl', $2::text)
             WHERE id = $1::uuid`,
            [promptRequest.id, transport.conversationUrl]
        );
        await db.query(
            `UPDATE conversations SET external_url = $2, external_chat_id = $3,
                 status = 'active', metadata = metadata || jsonb_build_object('lastAutomatedResponseAt', now())
             WHERE id = $1::uuid`,
            [project.conversation_id, transport.conversationUrl, transport.conversationId]
        );
        if (parsed.responseType !== 'script_batch') {
            throw new Error(`WORK_REQUIRES_DECISION:${parsed.responseType}:${parsed.summary}`);
        }

        await db.query(
            `UPDATE project_automation_attempts SET status = 'executing', prompt_response_id = $2::uuid
             WHERE id = $1::uuid`,
            [attemptRow.id, responseResult.rows[0].id]
        );
        const execution = await executeScripts({
            projectId: project.id,
            runKey,
            workspacePath,
            scripts: parsed.scripts
        });
        for (const outcome of execution.outcomes) {
            await storeLog(db, runId, `stdout:${outcome.filename}`, outcome.stdout);
            await storeLog(db, runId, `stderr:${outcome.filename}`, outcome.stderr);
        }
        await db.query(
            `UPDATE project_automation_attempts SET status = 'testing' WHERE id = $1::uuid`,
            [attemptRow.id]
        );
        const verification = await runVerification(workspacePath, project.settings?.testCommand);
        await storeLog(db, runId, 'test:stdout', verification.stdout);
        await storeLog(db, runId, 'test:stderr', verification.stderr);
        if (verification.exitCode !== 0) {
            throw Object.assign(new Error('WORK_TESTS_FAILED'), { outcome: verification });
        }
        await db.query(
            `UPDATE project_automation_attempts SET status = 'committing' WHERE id = $1::uuid`,
            [attemptRow.id]
        );
        const gitResult = await commitAndPush({
            workspacePath,
            stageKey: work.stage_key,
            workKey: work.work_key,
            title: work.title,
            env: repository.gitEnv
        });
        await completeWork(db, {
            project,
            work,
            attemptRow,
            responseId: responseResult.rows[0].id,
            runId,
            execution,
            verification,
            gitResult
        });
        return { projectId: project.id, workKey: work.work_key, commitSha: gitResult.commitSha };
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const detail = error?.outcome ? JSON.stringify(error.outcome).slice(0, 60_000) : message;
        await storeLog(db, runId, 'worker:error', detail);
        const terminal = attempt >= Number(state.max_work_attempts);
        await db.query(
            `UPDATE project_automation_attempts
             SET status = 'failed', error_text = $2, completed_at = now(),
                 result_json = result_json || jsonb_build_object('errorDetail', $3::text)
             WHERE id = $1::uuid`,
            [attemptRow.id, message.slice(0, 4000), detail]
        );
        await db.query(
            `UPDATE runs SET status = 'failed', exit_code = 1, finished_at = now(),
                 result_json = jsonb_build_object('error', $2::text)
             WHERE id = $1::uuid`,
            [runId, message.slice(0, 4000)]
        );
        await db.query(
            `UPDATE works SET status = $2, updated_at = now(),
                 metadata = metadata || jsonb_build_object('lastAutomationError', $3::text)
             WHERE id = $1::uuid`,
            [work.id, terminal ? 'failed' : 'pending', message.slice(0, 2000)]
        );
        await db.query(
            `UPDATE project_automation_state
             SET status = CASE WHEN status = 'paused' THEN 'paused' ELSE $2 END,
                 last_error = $3, lease_owner = NULL,
                 lease_expires_at = NULL, updated_at = now()
             WHERE project_id = $1::uuid`,
            [project.id, terminal ? 'failed' : 'queued', message.slice(0, 4000)]
        );
        throw error;
    }
}

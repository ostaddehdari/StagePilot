import { randomUUID } from 'node:crypto';

import { parseManagerResponse } from '../manager/response-parser.mjs';
import {
    recoverPreviouslySentPrompt,
    sendPromptAndWait
} from './browser-transport.mjs';

const TRANSPORT_MESSAGES = {
    worker_claimed: 'Worker درخواست برنامه‌ریزی را دریافت کرد.',
    context_loading: 'اطلاعات پروژه، حساب ChatGPT و لینک مقصد در حال بررسی است.',
    context_ready: 'حساب ChatGPT و مقصد گفت‌وگو آماده شد.',
    browser_starting: 'مرورگر ChatGPT در حال راه‌اندازی است.',
    visible_handoff_completed: 'مرورگر noVNC به‌صورت ایمن به حالت اجرای خودکار تحویل داده شد.',
    browser_ready: 'مرورگر آماده شد.',
    target_opening: 'لینک چت یا پروژه ChatGPT در حال بازشدن است.',
    target_opened: 'لینک ChatGPT باز شد.',
    project_creating: 'ساخت پروژه جدید در ChatGPT شروع شد.',
    project_created: 'پروژه جدید ChatGPT ساخته شد.',
    new_chat_opening: 'چت جدید ChatGPT در حال بازشدن است.',
    new_chat_opened: 'چت جدید ChatGPT باز شد.',
    composer_drafting: 'متن درخواست در کادر پیام وارد می‌شود.',
    composer_ready: 'متن درخواست در کادر پیام وارد شد.',
    send_clicking: 'دکمه ارسال ChatGPT در حال کلیک است.',
    send_confirmed: 'ارسال پیام به ChatGPT تأیید شد.',
    send_uncertain_recovery: 'کلیک انجام شده است؛ بدون ارسال مجدد، وجود پیام و پاسخ بررسی می‌شود.',
    response_waiting: 'در انتظار تکمیل پاسخ ChatGPT هستیم.',
    response_recovery: 'پاسخ ارسال‌شده بدون ارسال دوباره در حال بازیابی است.',
    response_received: 'پاسخ کامل ChatGPT دریافت شد.',
    completed: 'پاسخ اعتبارسنجی و در پروژه نمایش داده شد.',
    failed: 'چرخه ChatGPT با خطا متوقف شد.'
};

async function recordTransportProgress(db, row, progress) {
    const stage = String(progress?.stage ?? 'unknown').slice(0, 80);
    const at = String(progress?.at ?? new Date().toISOString());
    const entry = { ...progress, stage, at };
    const nextStatus = stage === 'completed'
        ? 'completed'
        : ['send_confirmed', 'send_uncertain_recovery'].includes(stage)
        ? 'sent'
        : stage === 'response_waiting'
            ? 'waiting_response'
            : 'processing';

    await db.query(
        `UPDATE prompt_requests
         SET status = $2,
             sent_at = CASE
                WHEN $3::text IN ('send_confirmed', 'send_uncertain_recovery')
                THEN COALESCE(sent_at, now())
                ELSE sent_at
             END,
             context_json = COALESCE(context_json, '{}'::jsonb) || jsonb_build_object(
                'transportStage', $3::text,
                'transportUpdatedAt', $4::text,
                'transportHistory', COALESCE(context_json->'transportHistory', '[]'::jsonb) || $5::jsonb
             )
         WHERE id = $1::uuid`,
        [row.id, nextStatus, stage, at, JSON.stringify([entry])]
    );

    if (row.project_id) {
        await db.query(
            `INSERT INTO events (
                project_id, entity_type, entity_id, event_type, severity,
                actor_type, actor_id, message, data
             ) VALUES (
                $1::uuid, 'prompt_request', $2::text, $3, 'info',
                'worker', $4, $5, $6::jsonb
             )`,
            [
                row.project_id,
                row.id,
                `planning.transport.${stage}`,
                row.claimed_by ?? 'planning-worker',
                TRANSPORT_MESSAGES[stage] ?? `ChatGPT transport stage: ${stage}`,
                JSON.stringify(entry)
            ]
        );
    }
}

function cleanJsonResponse(value) {
    const text = String(value ?? '').trim();
    const fenced = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
    return fenced ? fenced[1].trim() : text;
}

export async function claimPlanningRequest(db, workerKey) {
    const client = await db.connect();
    try {
        await client.query('BEGIN');
        const selected = await client.query(
            `SELECT pr.id
             FROM prompt_requests pr
             JOIN projects p
               ON p.id = pr.project_id
              AND p.deleted_at IS NULL
             WHERE pr.request_type IN (
                    'project_plan', 'project_proposal', 'project_plan_tree'
             )
               AND pr.status IN ('created', 'retry')
               AND (pr.next_attempt_at IS NULL OR pr.next_attempt_at <= now())
             ORDER BY pr.created_at
             FOR UPDATE SKIP LOCKED
             LIMIT 1`
        );
        if (selected.rowCount !== 1) {
            await client.query('COMMIT');
            return null;
        }
        const claimed = await client.query(
            `UPDATE prompt_requests
             SET status = 'processing', claimed_at = now(), claimed_by = $2,
                 send_attempts = send_attempts + 1, last_error = NULL
             WHERE id = $1::uuid
             RETURNING *`,
            [selected.rows[0].id, workerKey]
        );
        await client.query(
            `UPDATE prompt_requests
             SET context_json = COALESCE(context_json, '{}'::jsonb) || jsonb_build_object(
                    'transportStage', 'worker_claimed',
                    'transportUpdatedAt', now()::text,
                    'transportHistory', COALESCE(context_json->'transportHistory', '[]'::jsonb)
                        || jsonb_build_array(jsonb_build_object(
                            'stage', 'worker_claimed',
                            'at', now()::text,
                            'workerKey', $2::text
                        ))
                 )
             WHERE id = $1::uuid`,
            [selected.rows[0].id, workerKey]
        );
        await client.query(
            `INSERT INTO events (
                project_id, entity_type, entity_id, event_type, severity,
                actor_type, actor_id, message, data
             )
             SELECT project_id, 'prompt_request', id::text,
                    'planning.transport.worker_claimed', 'info', 'worker', $2,
                    $3, jsonb_build_object('workerKey', $2::text)
             FROM prompt_requests
             WHERE id = $1::uuid`,
            [selected.rows[0].id, workerKey, TRANSPORT_MESSAGES.worker_claimed]
        );
        await client.query('COMMIT');
        return claimed.rows[0];
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}

async function requestContext(db, requestId) {
    const result = await db.query(
        `SELECT pr.*, p.name AS project_name,
                a.id AS account_id, a.profile_key, p.settings,
                c.external_url, c.external_chat_id, c.status AS conversation_status,
                c.started_reason
         FROM prompt_requests pr
         JOIN projects p ON p.id = pr.project_id
         JOIN chat_accounts a ON a.id = p.selected_chat_account_id
         JOIN conversations c ON c.id = pr.conversation_id
         WHERE pr.id = $1::uuid
           AND p.deleted_at IS NULL
           AND a.deleted_at IS NULL`,
        [requestId]
    );
    if (result.rowCount !== 1) throw new Error('PROMPT_REQUEST_CONTEXT_NOT_FOUND');
    return result.rows[0];
}


async function persistProposalResponse(db, row, transport) {
    const rawText = cleanJsonResponse(transport.text);
    const parsed = parseManagerResponse(rawText);
    if (parsed.responseType !== 'project_proposal') {
        throw new Error(`EXPECTED_PROJECT_PROPOSAL:${parsed.responseType}`);
    }
    const client = await db.connect();
    try {
        await client.query('BEGIN');
        const responseResult = await client.query(
            `INSERT INTO prompt_responses (
                prompt_request_id, response_type, raw_text, parsed_json,
                extraction_status, is_complete
             ) VALUES ($1::uuid, 'project_proposal', $2, $3::jsonb, 'validated', true)
             RETURNING id`,
            [row.id, rawText, JSON.stringify(parsed.envelope)]
        );
        const revisionResult = await client.query(
            `SELECT GREATEST(current_plan_revision, 1) AS revision
             FROM projects WHERE id = $1::uuid FOR UPDATE`,
            [row.project_id]
        );
        await client.query(
            `INSERT INTO project_planning_messages (
                project_id, revision, role, message_type, content, payload
             ) VALUES (
                $1::uuid, $2, 'assistant', 'proposal_draft', $3,
                jsonb_build_object(
                    'proposal', $4::jsonb,
                    'summary', $5::text,
                    'promptResponseId', $6::uuid
                )
             )`,
            [
                row.project_id,
                revisionResult.rows[0].revision,
                parsed.envelope.proposalMarkdown,
                JSON.stringify(parsed.envelope.proposal),
                parsed.envelope.summary,
                responseResult.rows[0].id
            ]
        );
        await client.query(
            `UPDATE prompt_requests
             SET status = 'completed', completed_at = now(), last_error = NULL,
                 context_json = context_json || jsonb_build_object(
                    'responseSha256', $2::text, 'conversationUrl', $3::text
                 )
             WHERE id = $1::uuid`,
            [row.id, transport.sha256, transport.conversationUrl]
        );
        await client.query(
            `UPDATE conversations
             SET external_url = $2, external_chat_id = $3, status = 'active',
                 metadata = metadata || jsonb_build_object('lastAutomatedResponseAt', now())
             WHERE id = $1::uuid`,
            [row.conversation_id, transport.conversationUrl, transport.conversationId]
        );
        await client.query(
            `UPDATE projects
             SET settings = COALESCE(settings, '{}'::jsonb) || jsonb_build_object(
                    'planningStatus', 'proposal_draft_ready'
                 ), updated_at = now()
             WHERE id = $1::uuid`,
            [row.project_id]
        );
        await client.query(
            `INSERT INTO events (
                project_id, entity_type, entity_id, event_type, severity,
                actor_type, actor_id, message, data
             ) VALUES (
                $1::uuid, 'prompt_request', $2::text,
                'planning.proposal.completed', 'info', 'worker', $3,
                'پروپوزال حرفه‌ای ChatGPT اعتبارسنجی و در گفت‌وگو ثبت شد.',
                jsonb_build_object('promptResponseId', $4::uuid)
             )`,
            [row.project_id, row.id, row.claimed_by, responseResult.rows[0].id]
        );
        await client.query('COMMIT');
        return { projectId: row.project_id, proposalDraft: true };
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}


async function persistPlanResponse(db, row, transport) {
    const rawText = cleanJsonResponse(transport.text);
    const parsed = parseManagerResponse(rawText);
    if (parsed.responseType !== 'project_plan') {
        throw new Error(`EXPECTED_PROJECT_PLAN:${parsed.responseType}`);
    }

    const client = await db.connect();
    try {
        await client.query('BEGIN');
        const responseResult = await client.query(
            `INSERT INTO prompt_responses (
                prompt_request_id, response_type, raw_text, parsed_json,
                extraction_status, is_complete
             ) VALUES ($1::uuid, 'project_plan', $2, $3::jsonb, 'validated', true)
             RETURNING id`,
            [row.id, rawText, JSON.stringify(parsed.envelope)]
        );
        const versionResult = await client.query(
            `SELECT COALESCE(MAX(version), 0) + 1 AS version
             FROM project_plan_versions
             WHERE project_id = $1::uuid`,
            [row.project_id]
        );
        const version = Number(versionResult.rows[0].version);
        const plan = parsed.envelope.plan;
        const materialize = row.request_type === 'project_plan_tree';
        await client.query(
            `INSERT INTO project_plan_versions (
                project_id, version, status, title, summary, proposal_json,
                source_response_id, created_by
             ) VALUES ($1::uuid, $2, 'review', $3, $4, $5::jsonb, $6::uuid, 'assistant')`,
            [
                row.project_id,
                version,
                plan.projectName,
                plan.summary,
                JSON.stringify(plan),
                responseResult.rows[0].id
            ]
        );

        let stageCount = 0;
        let workCount = 0;
        if (materialize) {
            await client.query(
                `UPDATE project_plan_versions
                 SET status = 'superseded', updated_at = now()
                 WHERE project_id = $1::uuid
                   AND status = 'approved'
                   AND version <> $2`,
                [row.project_id, version]
            );
            await client.query(
                `UPDATE project_plan_versions
                 SET status = 'approved', approved_at = now(), updated_at = now()
                 WHERE project_id = $1::uuid AND version = $2`,
                [row.project_id, version]
            );
            await client.query(
                `INSERT INTO project_revisions (
                    project_id, revision, source, request_text,
                    plan_json, approved, approved_at
                 ) VALUES (
                    $1::uuid, $2, 'proposal_to_plan_tree', NULL,
                    $3::jsonb, true, now()
                 )
                 ON CONFLICT (project_id, revision) DO UPDATE SET
                    plan_json = EXCLUDED.plan_json,
                    approved = true,
                    approved_at = now(),
                    source = EXCLUDED.source`,
                [row.project_id, version, JSON.stringify(plan)]
            );
            await client.query(
                `DELETE FROM stages WHERE project_id = $1::uuid AND revision = $2`,
                [row.project_id, version]
            );
            for (let stageIndex = 0; stageIndex < plan.stages.length; stageIndex += 1) {
                const stage = plan.stages[stageIndex];
                const stageId = randomUUID();
                await client.query(
                    `INSERT INTO stages (
                        id, project_id, revision, stage_key, title, description,
                        position, weight, status, acceptance_criteria, metadata
                     ) VALUES (
                        $1::uuid, $2::uuid, $3, $4, $5, $6,
                        $7, $8, 'pending', $9::jsonb,
                        jsonb_build_object('sourcePlanVersion', $3::integer, 'generatedBy', 'project_plan_tree')
                     )`,
                    [
                        stageId, row.project_id, version, stage.id, stage.title,
                        stage.objective, stageIndex + 1, stage.weight,
                        JSON.stringify(stage.acceptanceCriteria)
                    ]
                );
                stageCount += 1;
                for (let workIndex = 0; workIndex < stage.works.length; workIndex += 1) {
                    const work = stage.works[workIndex];
                    await client.query(
                        `INSERT INTO works (
                            id, stage_id, work_key, title, description, position,
                            weight, status, acceptance_criteria, dependencies, metadata
                         ) VALUES (
                            $1::uuid, $2::uuid, $3, $4, $5, $6,
                            $7, 'pending', $8::jsonb, $9::jsonb,
                            jsonb_build_object('sourcePlanVersion', $10::integer, 'generatedBy', 'project_plan_tree')
                         )`,
                        [
                            randomUUID(), stageId, work.id, work.title,
                            work.objective, workIndex + 1, work.weight,
                            JSON.stringify(work.acceptanceCriteria),
                            JSON.stringify(work.dependsOn), version
                        ]
                    );
                    workCount += 1;
                }
            }
        }
        await client.query(
            `INSERT INTO project_planning_messages (
                project_id, revision, role, message_type, content, payload
             ) VALUES (
                $1::uuid, $2, 'assistant', $5, $3,
                jsonb_build_object('planVersion', $2::integer, 'promptResponseId', $4::uuid)
             )`,
            [
                row.project_id, version, plan.summary, responseResult.rows[0].id,
                materialize ? 'plan_tree' : 'proposal'
            ]
        );
        await client.query(
            `UPDATE prompt_requests
             SET status = 'completed', completed_at = now(), last_error = NULL,
                 context_json = context_json || jsonb_build_object(
                    'responseSha256', $2::text,
                    'conversationUrl', $3::text
                 )
             WHERE id = $1::uuid`,
            [row.id, transport.sha256, transport.conversationUrl]
        );
        await client.query(
            `UPDATE conversations
             SET external_url = $2, external_chat_id = $3, status = 'active',
                 metadata = metadata || jsonb_build_object('lastAutomatedResponseAt', now())
             WHERE id = $1::uuid`,
            [row.conversation_id, transport.conversationUrl, transport.conversationId]
        );
        await client.query(
            `UPDATE projects
             SET current_plan_revision = CASE
                    WHEN $4::boolean THEN $2::integer
                    ELSE current_plan_revision
                 END,
                 settings = COALESCE(settings, '{}'::jsonb) || jsonb_build_object(
                    'planningStatus', $3::text,
                    'latestPlanVersion', $2::integer,
                    'approvedPlanVersion', CASE WHEN $4::boolean THEN $2::integer ELSE COALESCE((settings->>'approvedPlanVersion')::integer, 0) END,
                    'automationStatus', CASE WHEN $4::boolean THEN 'paused' ELSE COALESCE(settings->>'automationStatus', 'idle') END
                 ), updated_at = now()
             WHERE id = $1::uuid`,
            [
                row.project_id,
                version,
                materialize ? 'plan_tree_ready' : 'proposal_review',
                materialize
            ]
        );
        if (materialize) {
            await client.query(
                `INSERT INTO project_automation_state (
                    project_id, status, mode, max_work_attempts, metadata
                 ) VALUES (
                    $1::uuid, 'paused', 'automatic', 3,
                    jsonb_build_object('approvedPlanVersion', $2::integer, 'startedBy', 'plan_tree_generation')
                 )
                 ON CONFLICT (project_id) DO UPDATE SET
                    status = 'paused', mode = 'automatic',
                    current_stage_id = NULL, current_work_id = NULL,
                    lease_owner = NULL, lease_expires_at = NULL,
                    last_error = NULL, completed_at = NULL,
                    metadata = project_automation_state.metadata || EXCLUDED.metadata,
                    updated_at = now()`,
                [row.project_id, version]
            );
        }
        await client.query(
            `INSERT INTO events (
                project_id, entity_type, entity_id, event_type, severity,
                actor_type, actor_id, message, data
             ) VALUES (
                $1::uuid, 'prompt_request', $2::text,
                $5::text, 'info', 'worker', $3,
                $6::text,
                jsonb_build_object(
                    'planVersion', $4::integer,
                    'stageCount', $7::integer,
                    'workCount', $8::integer
                )
             )`,
            [
                row.project_id, row.id, row.claimed_by, version,
                materialize ? 'project.plan_tree.materialized' : 'planning.response.completed',
                materialize
                    ? 'پروپوزال رسمی به Stage و Work اجرایی تبدیل شد؛ اجرا تا تأیید کاربر متوقف است.'
                    : 'ChatGPT planning response validated and saved.',
                stageCount, workCount
            ]
        );
        await client.query('COMMIT');
        return {
            projectId: row.project_id,
            planVersion: version,
            planTree: materialize,
            stageCount,
            workCount
        };
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}

export async function processPlanningRequest(db, request) {
    let row = request;
    try {
        await recordTransportProgress(db, row, {
            stage: 'context_loading',
            at: new Date().toISOString()
        });
        row = await requestContext(db, request.id);
        await recordTransportProgress(db, row, {
            stage: 'context_ready',
            at: new Date().toISOString(),
            accountId: row.account_id,
            profileKey: row.profile_key,
            targetType: row.external_url ? 'existing' : 'new',
            targetUrl: row.external_url ?? null
        });
        const operationId = `${row.request_type}:${row.id}`;
        const history = Array.isArray(row.context_json?.transportHistory)
            ? row.context_json.transportHistory
            : [];
        const confirmedSend = [...history]
            .reverse()
            .find(item => item?.stage === 'send_confirmed');
        const alreadySent = Boolean(
            row.sent_at
            || confirmedSend
            || row.context_json?.recoveryOnly === true
            || row.context_json?.resendBlocked === true
        );
        const recoveryConversationUrl = row.external_url
            ?? confirmedSend?.conversationUrl
            ?? null;
        const recoveryConversationId = confirmedSend?.conversationId
            ?? null;
        const shared = {
            profileKey: row.profile_key,
            accountId: row.account_id,
            operationId,
            promptText: row.prompt_text,
            timeoutMs: Number(process.env.STAGEPILOT_AI_RESPONSE_TIMEOUT_MS ?? 240_000),
            onProgress: progress => recordTransportProgress(db, row, progress)
        };
        const response = alreadySent
            ? await recoverPreviouslySentPrompt({
                ...shared,
                conversationUrl: recoveryConversationUrl,
                provisionalConversationId: recoveryConversationId
            })
            : await sendPromptAndWait({
                ...shared,
                conversationUrl: row.external_url,
                createProjectName:
                    !row.external_url
                    && row.started_reason === 'new_chatgpt_project_requested'
                    && row.settings?.chatTargetType === 'project'
                        ? row.project_name
                        : null
            });
        const persisted = row.request_type === 'project_proposal'
            ? await persistProposalResponse(db, row, response)
            : await persistPlanResponse(db, row, response);
        await recordTransportProgress(db, row, {
            stage: 'completed',
            at: new Date().toISOString(),
            planVersion: persisted.planVersion ?? null,
            proposalDraft: persisted.proposalDraft ?? false,
            planTree: persisted.planTree ?? false,
            responseSha256: response.sha256
        });
        return persisted;
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const stack = error instanceof Error ? error.stack ?? '' : '';
        const diagnostic = error && typeof error === 'object' && 'diagnostic' in error
            ? error.diagnostic
            : null;
        const failedAt = new Date().toISOString();
        await db.query(
            `UPDATE prompt_requests
             SET status = 'failed', last_error = $2, completed_at = now(),
                 context_json = COALESCE(context_json, '{}'::jsonb) || jsonb_build_object(
                    'transportStage', 'failed',
                    'transportUpdatedAt', $3::text,
                    'transportHistory', COALESCE(context_json->'transportHistory', '[]'::jsonb)
                        || $4::jsonb,
                    'failureStack', $5::text,
                    'failureDiagnostic', $6::jsonb
                 )
             WHERE id = $1::uuid`,
            [
                request.id,
                message.slice(0, 4000),
                failedAt,
                JSON.stringify([{ stage: 'failed', at: failedAt, error: message.slice(0, 4000) }]),
                stack.slice(0, 12_000),
                JSON.stringify(diagnostic)
            ]
        );
        if (row.project_id ?? request.project_id) {
            const projectId = row.project_id ?? request.project_id;
            await db.query(
                `INSERT INTO events (
                    project_id, entity_type, entity_id, event_type, severity,
                    actor_type, actor_id, message, data
                 ) VALUES (
                    $1::uuid, 'prompt_request', $2::text,
                    'planning.response.failed', 'error', 'worker', $3,
                    $4, $5::jsonb
                 )`,
                [
                    projectId,
                    request.id,
                    row.claimed_by ?? request.claimed_by ?? 'planning-worker',
                    `${TRANSPORT_MESSAGES.failed} ${message}`.slice(0, 2000),
                    JSON.stringify({
                        automaticRetry: false,
                        errorName: error instanceof Error ? error.name : 'Error',
                        errorMessage: message.slice(0, 4000),
                        stack: stack.slice(0, 12_000),
                        accountId: row.account_id ?? null,
                        profileKey: row.profile_key ?? null,
                        conversationUrl: row.external_url ?? null,
                        browserDiagnostic: diagnostic
                    })
                ]
            );
            await db.query(
                `INSERT INTO project_planning_messages (
                    project_id, revision, role, message_type, content, payload
                 )
                 SELECT $1::uuid, GREATEST(current_plan_revision, 1),
                        'system', 'prompt', $2, $3::jsonb
                 FROM projects
                 WHERE id = $1::uuid AND deleted_at IS NULL`,
                [
                    projectId,
                    `چرخه ChatGPT متوقف شد: ${message}`.slice(0, 30_000),
                    JSON.stringify({ promptRequestId: request.id, stage: 'failed' })
                ]
            );
        }
        throw error;
    }
}

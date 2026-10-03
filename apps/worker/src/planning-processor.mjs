import { parseManagerResponse } from '../manager/response-parser.mjs';
import { sendPromptAndWait } from './browser-transport.mjs';

const TRANSPORT_MESSAGES = {
    worker_claimed: 'Worker درخواست برنامه‌ریزی را دریافت کرد.',
    context_loading: 'اطلاعات پروژه، حساب ChatGPT و لینک مقصد در حال بررسی است.',
    context_ready: 'حساب ChatGPT و مقصد گفت‌وگو آماده شد.',
    browser_starting: 'مرورگر ChatGPT در حال راه‌اندازی است.',
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
    response_waiting: 'در انتظار تکمیل پاسخ ChatGPT هستیم.',
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
        : stage === 'send_confirmed'
        ? 'sent'
        : stage === 'response_waiting'
            ? 'waiting_response'
            : 'processing';

    await db.query(
        `UPDATE prompt_requests
         SET status = $2,
             sent_at = CASE WHEN $3::text = 'send_confirmed' THEN COALESCE(sent_at, now()) ELSE sent_at END,
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
             WHERE pr.request_type = 'project_plan'
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
        await client.query(
            `INSERT INTO project_planning_messages (
                project_id, revision, role, message_type, content, payload
             ) VALUES (
                $1::uuid, $2, 'assistant', 'proposal', $3,
                jsonb_build_object('planVersion', $2::integer, 'promptResponseId', $4::uuid)
             )`,
            [row.project_id, version, plan.summary, responseResult.rows[0].id]
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
             SET settings = settings || jsonb_build_object(
                    'planningStatus', 'proposal_review',
                    'latestPlanVersion', $2::integer
                 ), updated_at = now()
             WHERE id = $1::uuid`,
            [row.project_id, version]
        );
        await client.query(
            `INSERT INTO events (
                project_id, entity_type, entity_id, event_type, severity,
                actor_type, actor_id, message, data
             ) VALUES (
                $1::uuid, 'prompt_request', $2::text,
                'planning.response.completed', 'info', 'worker', $3,
                'ChatGPT planning response validated and saved.',
                jsonb_build_object('planVersion', $4::integer)
             )`,
            [row.project_id, row.id, row.claimed_by, version]
        );
        await client.query('COMMIT');
        return { projectId: row.project_id, planVersion: version };
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
        const response = await sendPromptAndWait({
            profileKey: row.profile_key,
            accountId: row.account_id,
            conversationUrl: row.external_url,
            createProjectName:
                !row.external_url
                && row.started_reason === 'new_chatgpt_project_requested'
                && row.settings?.chatTargetType === 'project'
                    ? row.project_name
                    : null,
            operationId: `plan:${row.id}`,
            promptText: row.prompt_text,
            timeoutMs: Number(process.env.STAGEPILOT_AI_RESPONSE_TIMEOUT_MS ?? 240_000),
            onProgress: progress => recordTransportProgress(db, row, progress)
        });
        const persisted = await persistPlanResponse(db, row, response);
        await recordTransportProgress(db, row, {
            stage: 'completed',
            at: new Date().toISOString(),
            planVersion: persisted.planVersion,
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

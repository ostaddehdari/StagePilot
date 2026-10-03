import { parseManagerResponse } from '../manager/response-parser.mjs';
import { sendPromptAndWait } from './browser-transport.mjs';

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
                a.id AS account_id, a.profile_key,
                c.external_url, c.external_chat_id, c.status AS conversation_status
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
    const row = await requestContext(db, request.id);
    try {
        const response = await sendPromptAndWait({
            profileKey: row.profile_key,
            accountId: row.account_id,
            conversationUrl: row.external_url,
            operationId: `plan:${row.id}`,
            promptText: row.prompt_text,
            timeoutMs: Number(process.env.STAGEPILOT_AI_RESPONSE_TIMEOUT_MS ?? 240_000)
        });
        return await persistPlanResponse(db, row, response);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await db.query(
            `UPDATE prompt_requests
             SET status = 'failed', last_error = $2, completed_at = now()
             WHERE id = $1::uuid`,
            [row.id, message.slice(0, 4000)]
        );
        await db.query(
            `INSERT INTO events (
                project_id, entity_type, entity_id, event_type, severity,
                actor_type, actor_id, message, data
             ) VALUES (
                $1::uuid, 'prompt_request', $2::text,
                'planning.response.failed', 'error', 'worker', $3,
                $4, jsonb_build_object('automaticRetry', false)
             )`,
            [row.project_id, row.id, row.claimed_by, message.slice(0, 2000)]
        );
        throw error;
    }
}

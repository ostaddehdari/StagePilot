import { getDatabasePool } from './db';

export async function getProjectAutomation(projectId: string) {
    const db = getDatabasePool();
    const [state, attempts, worker, requests] = await Promise.all([
        db.query(
            `SELECT * FROM project_automation_state WHERE project_id = $1::uuid`,
            [projectId]
        ),
        db.query(
            `SELECT paa.id, paa.attempt, paa.status, paa.run_key,
                    paa.commit_sha, paa.error_text, paa.started_at, paa.completed_at,
                    s.stage_key, w.work_key, w.title AS work_title
             FROM project_automation_attempts paa
             LEFT JOIN stages s ON s.id = paa.stage_id
             LEFT JOIN works w ON w.id = paa.work_id
             WHERE paa.project_id = $1::uuid
             ORDER BY paa.created_at DESC LIMIT 30`,
            [projectId]
        ),
        db.query(
            `SELECT worker_key, worker_version, status, current_job,
                    last_error, heartbeat_at
             FROM worker_heartbeats
             ORDER BY heartbeat_at DESC LIMIT 1`
        ),
        db.query(
            `SELECT pr.id, pr.request_key, pr.request_type, pr.status,
                    pr.context_json, pr.last_error, pr.sent_at,
                    pr.completed_at, pr.created_at,
                    s.id AS stage_id, s.stage_key, s.title AS stage_title,
                    w.id AS work_id, w.work_key, w.title AS work_title,
                    paa.id AS attempt_id, paa.attempt, paa.status AS attempt_status
             FROM prompt_requests pr
             LEFT JOIN stages s ON s.id = pr.stage_id
             LEFT JOIN works w ON w.id = pr.work_id
             LEFT JOIN project_automation_attempts paa
               ON paa.prompt_request_id = pr.id
             WHERE pr.project_id = $1::uuid
               AND pr.deleted_at IS NULL
             ORDER BY pr.created_at DESC`,
            [projectId]
        )
    ]);
    return {
        state: state.rows[0] ?? null,
        attempts: attempts.rows,
        worker: worker.rows[0] ?? null,
        requests: requests.rows
    };
}

function uuid(value: unknown): string {
    const result = typeof value === 'string' ? value.trim() : '';
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(result)) {
        throw new Error('INVALID_UUID');
    }
    return result;
}

export async function controlProjectAutomationNode(
    projectId: string,
    kindValue: unknown,
    nodeIdValue: unknown,
    actionValue: unknown
) {
    const kind = kindValue === 'stage' || kindValue === 'work' ? kindValue : '';
    const action = typeof actionValue === 'string' ? actionValue.trim() : '';
    const nodeId = uuid(nodeIdValue);
    if (!kind) throw new Error('INVALID_NODE_KIND');
    if (!['play', 'pause', 'resume'].includes(action)) throw new Error('INVALID_NODE_ACTION');

    const db = getDatabasePool();
    const client = await db.connect();
    try {
        await client.query('BEGIN');
        const node = kind === 'stage'
            ? await client.query(
                `SELECT id, stage_key AS node_key, title, status
                 FROM stages WHERE id = $1::uuid AND project_id = $2::uuid FOR UPDATE`,
                [nodeId, projectId]
            )
            : await client.query(
                `SELECT w.id, w.work_key AS node_key, w.title, w.status, w.stage_id
                 FROM works w JOIN stages s ON s.id = w.stage_id
                 WHERE w.id = $1::uuid AND s.project_id = $2::uuid FOR UPDATE`,
                [nodeId, projectId]
            );
        if (node.rowCount !== 1) throw new Error('NODE_NOT_FOUND');
        if (node.rows[0].status === 'completed' && action !== 'pause') {
            throw new Error('COMPLETED_NODE_CANNOT_BE_RESTARTED');
        }

        if (action === 'pause') {
            if (kind === 'work') {
                await client.query(
                    `UPDATE works SET status = CASE WHEN status = 'running' THEN status ELSE 'paused' END,
                         metadata = metadata || jsonb_build_object('pausedBy', 'private-admin', 'pausedAt', now()::text),
                         updated_at = now()
                     WHERE id = $1::uuid AND status <> 'completed'`,
                    [nodeId]
                );
            } else {
                await client.query(
                    `UPDATE works SET status = 'paused',
                         metadata = metadata || jsonb_build_object('pausedBy', 'private-admin', 'pausedAt', now()::text),
                         updated_at = now()
                     WHERE stage_id = $1::uuid AND status IN ('pending', 'ready', 'draft', 'failed')`,
                    [nodeId]
                );
            }
            await client.query(
                `UPDATE project_automation_state
                 SET status = 'paused', lease_owner = NULL, lease_expires_at = NULL,
                     metadata = metadata || jsonb_build_object(
                        'lastAction', 'node_pause', 'selectedNodeKind', $2::text,
                        'selectedNodeId', $3::text, 'safeStopRequestedAt', now()::text
                     ), updated_at = now()
                 WHERE project_id = $1::uuid`,
                [projectId, kind, nodeId]
            );
            await client.query(
                `UPDATE prompt_requests pr
                 SET context_json = COALESCE(pr.context_json, '{}'::jsonb)
                    || jsonb_build_object(
                        'transportStage', 'safe_stop_requested',
                        'transportUpdatedAt', now()::text,
                        'safeStopRequestedAt', now()::text
                    )
                 WHERE pr.project_id = $1::uuid
                   AND pr.request_type = 'work_execution'
                   AND pr.status IN ('created', 'retry', 'processing', 'sent', 'waiting_response')
                   AND (($2::text = 'work' AND pr.work_id = $3::uuid)
                     OR ($2::text = 'stage' AND pr.stage_id = $3::uuid))`,
                [projectId, kind, nodeId]
            );
        } else {
            if (kind === 'work') {
                await client.query(
                    `UPDATE works SET status = CASE WHEN status IN ('paused', 'failed') THEN 'pending' ELSE status END,
                         metadata = metadata - 'pausedBy' - 'pausedAt', updated_at = now()
                     WHERE id = $1::uuid`,
                    [nodeId]
                );
            } else {
                await client.query(
                    `UPDATE works SET status = 'pending', metadata = metadata - 'pausedBy' - 'pausedAt',
                         updated_at = now()
                     WHERE stage_id = $1::uuid AND status IN ('paused', 'failed')`,
                    [nodeId]
                );
            }
            const selection = kind === 'work'
                ? { selectedWorkId: nodeId, selectedStageId: null }
                : { selectedWorkId: null, selectedStageId: nodeId };
            await client.query(
                `INSERT INTO project_automation_state (
                    project_id, status, mode, started_at, metadata
                 ) VALUES ($1::uuid, 'queued', 'automatic', now(), $2::jsonb)
                 ON CONFLICT (project_id) DO UPDATE SET
                    status = 'queued', lease_owner = NULL, lease_expires_at = NULL,
                    last_error = NULL, completed_at = NULL,
                    metadata = (project_automation_state.metadata - 'selectedWorkId' - 'selectedStageId')
                        || EXCLUDED.metadata,
                    updated_at = now()`,
                [projectId, JSON.stringify({ ...selection, lastAction: action, selectedNodeKind: kind, selectedNodeId: nodeId })]
            );
        }

        await client.query(
            `INSERT INTO events (
                project_id, entity_type, entity_id, event_type, severity,
                actor_type, actor_id, message, data
             ) VALUES (
                $1::uuid, $2::text, $3::text, 'project.automation.node_controlled', 'info',
                'user', 'private-admin', $4,
                jsonb_build_object('kind', $2::text, 'nodeId', $3::text, 'action', $5::text,
                                   'nodeKey', $6::text, 'title', $7::text)
             )`,
            [
                projectId,
                kind,
                nodeId,
                action === 'pause' ? 'توقف امن نود برنامه ثبت شد.' : 'نود انتخاب‌شده برای اجرا در صف قرار گرفت.',
                action,
                node.rows[0].node_key,
                node.rows[0].title
            ]
        );
        await client.query('COMMIT');
        return { kind, nodeId, action, status: action === 'pause' ? 'paused' : 'queued' };
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}

export async function controlProjectPromptRequest(
    projectId: string,
    requestIdValue: unknown,
    actionValue: unknown
) {
    const requestId = uuid(requestIdValue);
    const action = typeof actionValue === 'string' ? actionValue.trim() : '';
    if (!['pause', 'resume', 'delete'].includes(action)) throw new Error('INVALID_REQUEST_ACTION');
    const db = getDatabasePool();
    const request = await db.query(
        `SELECT id, request_type, status, work_id
         FROM prompt_requests
         WHERE id = $1::uuid AND project_id = $2::uuid AND deleted_at IS NULL`,
        [requestId, projectId]
    );
    if (request.rowCount !== 1) throw new Error('PROMPT_REQUEST_NOT_FOUND');
    const row = request.rows[0];
    if (row.request_type !== 'work_execution' || !row.work_id) {
        if (action !== 'delete') throw new Error('ONLY_WORK_REQUESTS_ARE_CONTROLLABLE');
    }
    const active = ['created', 'retry', 'processing', 'sent', 'waiting_response'].includes(row.status);
    if (action === 'delete') {
        if (active) throw new Error('ACTIVE_REQUEST_CANNOT_BE_DELETED');
        await db.query(
            `UPDATE prompt_requests SET deleted_at = now(), deleted_by = 'private-admin'
             WHERE id = $1::uuid`,
            [requestId]
        );
        await db.query(
            `INSERT INTO events (
                project_id, entity_type, entity_id, event_type, severity,
                actor_type, actor_id, message, data
             ) VALUES ($1::uuid, 'prompt_request', $2::text,
                'prompt_request.deleted', 'warning', 'user', 'private-admin',
                'درخواست هوش مصنوعی از فهرست پروژه حذف شد.',
                jsonb_build_object('requestId', $2::text, 'previousStatus', $3::text))`,
            [projectId, requestId, row.status]
        );
        return { requestId, action, deleted: true };
    }
    return controlProjectAutomationNode(projectId, 'work', row.work_id, action);
}

export async function controlProjectAutomation(
    projectId: string,
    actionValue: unknown
) {
    const action = typeof actionValue === 'string' ? actionValue.trim() : '';
    if (!['start', 'resume', 'pause', 'retry'].includes(action)) {
        throw new Error('INVALID_AUTOMATION_ACTION');
    }
    const targetStatus = action === 'pause' ? 'paused' : 'queued';
    const db = getDatabasePool();
    const result = await db.query(
        `INSERT INTO project_automation_state (
            project_id, status, mode, started_at, metadata
         ) VALUES ($1::uuid, $2, 'automatic', now(), jsonb_build_object('lastAction', $3::text))
         ON CONFLICT (project_id) DO UPDATE SET
            status = EXCLUDED.status,
            lease_owner = CASE WHEN $2 = 'paused' THEN NULL ELSE project_automation_state.lease_owner END,
            lease_expires_at = CASE WHEN $2 = 'paused' THEN NULL ELSE project_automation_state.lease_expires_at END,
            last_error = CASE WHEN $2 = 'queued' THEN NULL ELSE project_automation_state.last_error END,
            completed_at = CASE WHEN $2 = 'queued' THEN NULL ELSE project_automation_state.completed_at END,
            metadata = project_automation_state.metadata || EXCLUDED.metadata,
            updated_at = now()
         RETURNING *`,
        [projectId, targetStatus, action]
    );
    await db.query(
        `INSERT INTO events (
            project_id, entity_type, entity_id, event_type, severity,
            actor_type, actor_id, message, data
         ) VALUES (
            $1::uuid, 'project_automation', $1::text,
            'project.automation.controlled', 'info', 'user', 'private-admin',
            'Project automation state changed by user.',
            jsonb_build_object('action', $2::text, 'status', $3::text)
         )`,
        [projectId, action, targetStatus]
    );
    return result.rows[0];
}

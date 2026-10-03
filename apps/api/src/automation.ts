import { getDatabasePool } from './db';

export async function getProjectAutomation(projectId: string) {
    const db = getDatabasePool();
    const [state, attempts, worker] = await Promise.all([
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
        )
    ]);
    return {
        state: state.rows[0] ?? null,
        attempts: attempts.rows,
        worker: worker.rows[0] ?? null
    };
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

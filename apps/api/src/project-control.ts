import { randomBytes } from 'node:crypto';
import { chmod, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { getDatabasePool } from './db';


type NodeKind = 'stage' | 'work';

const GITHUB_SECRET_ROOT = process.env.STAGEPILOT_GITHUB_SECRET_ROOT
    ?? '/opt/stagepilot/runtime/github';


function cleanText(value: unknown, maximum = 10_000): string {
    if (typeof value !== 'string') return '';
    const result = value.trim();
    if (result.length > maximum) throw new Error('TEXT_TOO_LONG');
    return result;
}


function nodeKind(value: unknown): NodeKind {
    if (value !== 'stage' && value !== 'work') {
        throw new Error('INVALID_NODE_KIND');
    }
    return value;
}


function uuid(value: unknown): string {
    const result = cleanText(value, 64);
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(result)) {
        throw new Error('INVALID_UUID');
    }
    return result;
}


function keyValue(value: unknown, prefix: string): string {
    const supplied = cleanText(value, 64);
    const result = supplied || `${prefix}-${Date.now().toString(36)}-${randomBytes(2).toString('hex')}`;
    if (!/^[A-Za-z][A-Za-z0-9_-]{1,63}$/.test(result)) {
        throw new Error('INVALID_NODE_KEY');
    }
    return result;
}


function pendingStatus(status: unknown, startedAt: unknown): boolean {
    return !startedAt && ['pending', 'ready', 'draft'].includes(String(status ?? 'pending'));
}


async function recordEvent(
    client: { query: (sql: string, values?: unknown[]) => Promise<unknown> },
    projectId: string,
    eventType: string,
    message: string,
    data: Record<string, unknown>,
    severity = 'info'
) {
    await client.query(
        `INSERT INTO events (
            project_id, entity_type, entity_id, event_type, severity,
            actor_type, actor_id, message, data
         ) VALUES (
            $1::uuid, 'project_workspace', $1::text, $2, $3,
            'user', 'private-admin', $4, $5::jsonb
         )`,
        [projectId, eventType, severity, message, JSON.stringify(data)]
    );
}


export async function recordProjectDiagnosticEvent(
    projectId: string,
    input: {
        eventType?: unknown;
        message?: unknown;
        severity?: unknown;
        data?: unknown;
    }
) {
    const eventType = cleanText(input.eventType, 120);
    const message = cleanText(input.message, 2_000);
    const severity = cleanText(input.severity, 20) || 'info';
    if (!/^[a-z0-9][a-z0-9._-]{2,119}$/.test(eventType)) throw new Error('INVALID_EVENT_TYPE');
    if (!['info', 'warning', 'error'].includes(severity)) throw new Error('INVALID_EVENT_SEVERITY');
    const data = input.data && typeof input.data === 'object' && !Array.isArray(input.data)
        ? input.data as Record<string, unknown>
        : {};
    const db = getDatabasePool();
    const exists = await db.query(
        `SELECT 1 FROM projects WHERE id = $1::uuid AND deleted_at IS NULL`,
        [projectId]
    );
    if (exists.rowCount !== 1) throw new Error('PROJECT_NOT_FOUND');
    await recordEvent(db, projectId, eventType, message, data, severity);
    return { recorded: true, eventType };
}


export async function updateProjectIntegrationSettings(
    projectId: string,
    input: {
        githubMode?: unknown;
        githubOwner?: unknown;
        githubUsername?: unknown;
        githubToken?: unknown;
        repositoryName?: unknown;
        repositoryVisibility?: unknown;
        chatTargetType?: unknown;
        chatProjectUrl?: unknown;
    }
) {
    const githubMode = cleanText(input.githubMode, 20) || 'global';
    const githubOwner = cleanText(input.githubOwner, 39);
    const githubUsername = cleanText(input.githubUsername, 39);
    const repositoryName = cleanText(input.repositoryName, 100);
    const repositoryVisibility = cleanText(input.repositoryVisibility, 20) || 'private';
    const chatTargetType = cleanText(input.chatTargetType, 20) || 'conversation';
    const chatProjectUrl = cleanText(input.chatProjectUrl, 2_000);
    const githubToken = cleanText(input.githubToken, 500);

    if (!['global', 'custom'].includes(githubMode)) throw new Error('INVALID_GITHUB_MODE');
    if (githubMode === 'custom') {
        if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/.test(githubOwner)) throw new Error('INVALID_GITHUB_OWNER');
        if (githubUsername && !/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/.test(githubUsername)) throw new Error('INVALID_GITHUB_USERNAME');
    }
    if (repositoryName && !/^[A-Za-z0-9._-]{1,100}$/.test(repositoryName)) throw new Error('INVALID_REPOSITORY_NAME');
    if (!['private', 'public'].includes(repositoryVisibility)) throw new Error('INVALID_REPOSITORY_VISIBILITY');
    if (!['conversation', 'project'].includes(chatTargetType)) throw new Error('INVALID_CHAT_TARGET_TYPE');
    if (chatProjectUrl) {
        let url: URL;
        try {
            url = new URL(chatProjectUrl);
        } catch {
            throw new Error('INVALID_CHAT_PROJECT_URL');
        }
        if (url.protocol !== 'https:' || !['chatgpt.com', 'www.chatgpt.com', 'chat.openai.com'].includes(url.hostname.toLowerCase())) {
            throw new Error('INVALID_CHAT_PROJECT_URL');
        }
    }
    if (githubToken && !githubToken.startsWith('github_pat_')) throw new Error('EXPECTED_FINE_GRAINED_PAT');

    const db = getDatabasePool();
    const current = await db.query(
        `SELECT p.settings, gc.secret_ref AS custom_secret_ref
         FROM projects p
         LEFT JOIN github_access_profiles gap
           ON gap.profile_key = 'github-project-' || p.id::text
         LEFT JOIN github_credentials gc
           ON gc.profile_id = gap.id AND gc.purpose = 'repository_api'
         WHERE p.id = $1::uuid AND p.deleted_at IS NULL`,
        [projectId]
    );
    if (current.rowCount !== 1) throw new Error('PROJECT_NOT_FOUND');
    let githubSecretRef = typeof current.rows[0].custom_secret_ref === 'string'
        ? current.rows[0].custom_secret_ref
        : '';
    if (githubToken) {
        const root = resolve(GITHUB_SECRET_ROOT);
        const path = resolve(root, `project-${projectId}-github-api-token`);
        if (!path.startsWith(`${root}/`)) throw new Error('INVALID_SECRET_PATH');
        await mkdir(root, { recursive: true, mode: 0o700 });
        await chmod(root, 0o700);
        await writeFile(path, `${githubToken}\n`, { encoding: 'utf8', mode: 0o600 });
        await chmod(path, 0o600);
        githubSecretRef = `file://${path}`;
    }
    const settings = {
        githubMode,
        githubOwner,
        githubUsername,
        repositoryName,
        repositoryVisibility,
        githubTokenConfigured: Boolean(githubSecretRef),
        chatTargetType,
        chatProjectUrl
    };
    const result = await db.query(
        `UPDATE projects
         SET settings = settings || $2::jsonb, updated_at = now()
         WHERE id = $1::uuid AND deleted_at IS NULL
         RETURNING id, settings, updated_at`,
        [projectId, JSON.stringify(settings)]
    );
    if (githubMode === 'custom') {
        const profile = await db.query(
            `INSERT INTO github_access_profiles (
                profile_key, owner_login, status, metadata
             ) VALUES (
                $1, $2, 'needs_verification',
                jsonb_build_object('username', $3::text, 'configuredFrom', 'project_settings', 'projectId', $4::text)
             )
             ON CONFLICT (profile_key) DO UPDATE SET
                owner_login = EXCLUDED.owner_login,
                metadata = github_access_profiles.metadata || EXCLUDED.metadata,
                updated_at = now()
             RETURNING id`,
            [`github-project-${projectId}`, githubOwner, githubUsername || githubOwner, projectId]
        );
        if (githubSecretRef) {
            await db.query(
                `INSERT INTO github_credentials (
                    profile_id, purpose, credential_type, secret_ref, status
                 ) VALUES ($1::uuid, 'repository_api', 'fine_grained_pat', $2, 'configured')
                 ON CONFLICT (profile_id, purpose) DO UPDATE SET
                    secret_ref = EXCLUDED.secret_ref,
                    credential_type = EXCLUDED.credential_type,
                    status = 'configured', verification = '{}'::jsonb,
                    verified_at = NULL, updated_at = now()`,
                [profile.rows[0].id, githubSecretRef]
            );
        }
    }
    await recordEvent(db, projectId, 'project.integrations.updated', 'AI and GitHub project settings updated.', {
        githubMode,
        githubOwner,
        repositoryName,
        chatTargetType,
        chatProjectUrlConfigured: Boolean(chatProjectUrl),
        githubTokenConfigured: Boolean(githubSecretRef)
    });
    return result.rows[0];
}


export async function createProjectTreeNode(
    projectId: string,
    input: {
        kind?: unknown;
        parentId?: unknown;
        key?: unknown;
        title?: unknown;
        description?: unknown;
        position?: unknown;
    }
) {
    const kind = nodeKind(input.kind);
    const title = cleanText(input.title, 300);
    const description = cleanText(input.description, 5_000);
    if (!title) throw new Error('NODE_TITLE_REQUIRED');

    const db = getDatabasePool();
    const client = await db.connect();
    try {
        await client.query('BEGIN');
        const project = await client.query(
            `SELECT current_plan_revision FROM projects
             WHERE id = $1::uuid AND deleted_at IS NULL FOR UPDATE`,
            [projectId]
        );
        if (project.rowCount !== 1) throw new Error('PROJECT_NOT_FOUND');
        const revision = Number(project.rows[0].current_plan_revision);

        let result;
        if (kind === 'stage') {
            const count = await client.query(
                `SELECT COUNT(*)::int AS count FROM stages
                 WHERE project_id = $1::uuid AND revision = $2`,
                [projectId, revision]
            );
            const requestedPosition = Number(input.position);
            const position = Number.isInteger(requestedPosition) && requestedPosition >= 0
                ? requestedPosition
                : Number(count.rows[0].count);
            await client.query(
                `UPDATE stages SET position = position + 1, updated_at = now()
                 WHERE project_id = $1::uuid AND revision = $2 AND position >= $3`,
                [projectId, revision, position]
            );
            result = await client.query(
                `INSERT INTO stages (
                    project_id, revision, stage_key, title, description,
                    position, weight, status, acceptance_criteria, metadata
                 ) VALUES ($1::uuid, $2, $3, $4, NULLIF($5, ''), $6, 1, 'pending', '[]',
                    jsonb_build_object('createdManually', true))
                 RETURNING *`,
                [projectId, revision, keyValue(input.key, 'stage'), title, description, position]
            );
        } else {
            const parentId = uuid(input.parentId);
            const stage = await client.query(
                `SELECT id FROM stages
                 WHERE id = $1::uuid AND project_id = $2::uuid AND revision = $3`,
                [parentId, projectId, revision]
            );
            if (stage.rowCount !== 1) throw new Error('STAGE_NOT_FOUND');
            const count = await client.query(
                `SELECT COUNT(*)::int AS count FROM works WHERE stage_id = $1::uuid`,
                [parentId]
            );
            const requestedPosition = Number(input.position);
            const position = Number.isInteger(requestedPosition) && requestedPosition >= 0
                ? requestedPosition
                : Number(count.rows[0].count);
            await client.query(
                `UPDATE works SET position = position + 1, updated_at = now()
                 WHERE stage_id = $1::uuid AND position >= $2`,
                [parentId, position]
            );
            result = await client.query(
                `INSERT INTO works (
                    stage_id, work_key, title, description, position, weight,
                    status, acceptance_criteria, dependencies, metadata
                 ) VALUES ($1::uuid, $2, $3, NULLIF($4, ''), $5, 1,
                    'pending', '[]', '[]', jsonb_build_object('createdManually', true))
                 RETURNING *`,
                [parentId, keyValue(input.key, 'work'), title, description, position]
            );
        }

        await recordEvent(client, projectId, `tree.${kind}.created`, `${kind} manually added.`, {
            kind,
            nodeId: result.rows[0].id,
            title
        });
        await client.query('COMMIT');
        return result.rows[0];
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}


export async function updateProjectTreeNode(
    projectId: string,
    nodeIdValue: unknown,
    input: { kind?: unknown; title?: unknown; description?: unknown }
) {
    const kind = nodeKind(input.kind);
    const nodeId = uuid(nodeIdValue);
    const title = cleanText(input.title, 300);
    const description = cleanText(input.description, 5_000);
    if (!title) throw new Error('NODE_TITLE_REQUIRED');
    const db = getDatabasePool();
    const table = kind === 'stage' ? 'stages' : 'works';
    const projectJoin = kind === 'stage'
        ? 'node.project_id = $1::uuid'
        : 'EXISTS (SELECT 1 FROM stages s WHERE s.id = node.stage_id AND s.project_id = $1::uuid)';
    const result = await db.query(
        `UPDATE ${table} node SET title = $3, description = NULLIF($4, ''), updated_at = now()
         WHERE node.id = $2::uuid AND ${projectJoin}
         RETURNING node.*`,
        [projectId, nodeId, title, description]
    );
    if (result.rowCount !== 1) throw new Error('NODE_NOT_FOUND');
    await recordEvent(db, projectId, `tree.${kind}.updated`, `${kind} manually updated.`, {
        kind,
        nodeId,
        title
    });
    return result.rows[0];
}


export async function deleteProjectTreeNode(
    projectId: string,
    nodeIdValue: unknown,
    kindValue: unknown
) {
    const kind = nodeKind(kindValue);
    const nodeId = uuid(nodeIdValue);
    const db = getDatabasePool();
    const client = await db.connect();
    try {
        await client.query('BEGIN');
        if (kind === 'work') {
            const result = await client.query(
                `SELECT w.* FROM works w
                 JOIN stages s ON s.id = w.stage_id
                 WHERE w.id = $1::uuid AND s.project_id = $2::uuid FOR UPDATE`,
                [nodeId, projectId]
            );
            if (result.rowCount !== 1) throw new Error('NODE_NOT_FOUND');
            if (!pendingStatus(result.rows[0].status, result.rows[0].started_at)) {
                throw new Error('EXECUTED_NODE_CANNOT_BE_DELETED');
            }
            const attempts = await client.query(
                `SELECT 1 FROM project_automation_attempts WHERE work_id = $1::uuid LIMIT 1`,
                [nodeId]
            );
            if (attempts.rowCount) throw new Error('EXECUTED_NODE_CANNOT_BE_DELETED');
            await client.query(`DELETE FROM works WHERE id = $1::uuid`, [nodeId]);
        } else {
            const result = await client.query(
                `SELECT s.*,
                    EXISTS (
                        SELECT 1 FROM works w
                        LEFT JOIN project_automation_attempts paa ON paa.work_id = w.id
                        WHERE w.stage_id = s.id
                          AND (w.started_at IS NOT NULL OR w.status NOT IN ('pending', 'ready', 'draft') OR paa.id IS NOT NULL)
                    ) AS has_executed_work
                 FROM stages s
                 WHERE s.id = $1::uuid AND s.project_id = $2::uuid FOR UPDATE`,
                [nodeId, projectId]
            );
            if (result.rowCount !== 1) throw new Error('NODE_NOT_FOUND');
            if (!pendingStatus(result.rows[0].status, result.rows[0].started_at) || result.rows[0].has_executed_work) {
                throw new Error('EXECUTED_NODE_CANNOT_BE_DELETED');
            }
            await client.query(`DELETE FROM stages WHERE id = $1::uuid`, [nodeId]);
        }
        await recordEvent(client, projectId, `tree.${kind}.deleted`, `${kind} manually deleted.`, {
            kind,
            nodeId
        }, 'warning');
        await client.query('COMMIT');
        return { id: nodeId, kind, deleted: true };
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}


export async function reorderProjectTree(
    projectId: string,
    input: { kind?: unknown; parentId?: unknown; orderedIds?: unknown }
) {
    const kind = nodeKind(input.kind);
    if (!Array.isArray(input.orderedIds) || input.orderedIds.length > 500) {
        throw new Error('INVALID_NODE_ORDER');
    }
    const orderedIds = input.orderedIds.map(uuid);
    if (new Set(orderedIds).size !== orderedIds.length) throw new Error('DUPLICATE_NODE_ORDER');
    const db = getDatabasePool();
    const client = await db.connect();
    try {
        await client.query('BEGIN');
        if (kind === 'stage') {
            const existing = await client.query(
                `SELECT id FROM stages WHERE project_id = $1::uuid
                 AND revision = (SELECT current_plan_revision FROM projects WHERE id = $1::uuid)
                 ORDER BY position, created_at FOR UPDATE`,
                [projectId]
            );
            const existingIds = existing.rows.map(row => String(row.id));
            if (existingIds.length !== orderedIds.length || existingIds.some(id => !orderedIds.includes(id))) {
                throw new Error('INCOMPLETE_NODE_ORDER');
            }
            for (let position = 0; position < orderedIds.length; position += 1) {
                await client.query(`UPDATE stages SET position = $2, updated_at = now() WHERE id = $1::uuid`, [orderedIds[position], position]);
            }
        } else {
            const parentId = uuid(input.parentId);
            const existing = await client.query(
                `SELECT w.id FROM works w JOIN stages s ON s.id = w.stage_id
                 WHERE w.stage_id = $1::uuid AND s.project_id = $2::uuid
                 ORDER BY w.position, w.created_at FOR UPDATE`,
                [parentId, projectId]
            );
            const existingIds = existing.rows.map(row => String(row.id));
            if (existingIds.length !== orderedIds.length || existingIds.some(id => !orderedIds.includes(id))) {
                throw new Error('INCOMPLETE_NODE_ORDER');
            }
            for (let position = 0; position < orderedIds.length; position += 1) {
                await client.query(`UPDATE works SET position = $2, updated_at = now() WHERE id = $1::uuid`, [orderedIds[position], position]);
            }
        }
        await recordEvent(client, projectId, `tree.${kind}.reordered`, `${kind} order changed.`, {
            kind,
            count: orderedIds.length
        });
        await client.query('COMMIT');
        return { reordered: orderedIds.length };
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}


export async function saveProposalHtml(
    projectId: string,
    versionValue: unknown,
    htmlValue: unknown
) {
    const version = Number(versionValue);
    const html = typeof htmlValue === 'string' ? htmlValue.trim() : '';
    if (!Number.isInteger(version) || version < 1) throw new Error('INVALID_PLAN_VERSION');
    if (html.length > 500_000) throw new Error('PROPOSAL_HTML_TOO_LONG');
    const db = getDatabasePool();
    const result = await db.query(
        `UPDATE project_plan_versions SET proposal_html = $3, updated_at = now()
         WHERE project_id = $1::uuid AND version = $2 RETURNING id, version, updated_at`,
        [projectId, version, html]
    );
    if (result.rowCount !== 1) throw new Error('PLAN_NOT_FOUND');
    await recordEvent(db, projectId, 'proposal.html.updated', 'Proposal HTML edited.', { version });
    return result.rows[0];
}


export async function getProjectNodeInspector(
    projectId: string,
    kindValue: unknown,
    nodeIdValue: unknown
) {
    const kind = nodeKind(kindValue);
    const nodeId = uuid(nodeIdValue);
    const db = getDatabasePool();
    const node = kind === 'stage'
        ? await db.query(`SELECT id, stage_key AS node_key, title, status FROM stages WHERE id = $1::uuid AND project_id = $2::uuid`, [nodeId, projectId])
        : await db.query(`SELECT w.id, w.work_key AS node_key, w.title, w.status FROM works w JOIN stages s ON s.id = w.stage_id WHERE w.id = $1::uuid AND s.project_id = $2::uuid`, [nodeId, projectId]);
    if (node.rowCount !== 1) throw new Error('NODE_NOT_FOUND');

    const condition = kind === 'stage' ? 'pr.stage_id = $2::uuid' : 'pr.work_id = $2::uuid';
    const prompts = await db.query(
        `SELECT pr.id, pr.request_key, pr.request_type, pr.prompt_text, pr.status,
                pr.last_error, pr.context_json, pr.created_at,
                pres.raw_text, pres.parsed_json, pres.received_at,
                paa.error_text AS worker_error,
                paa.result_json->>'errorDetail' AS worker_error_detail,
                paa.run_key,
                COALESCE((
                    SELECT string_agg(
                        '[' || rl.stream || '] ' || rl.chunk,
                        E'\n' ORDER BY rl.created_at, rl.stream, rl.sequence_no, rl.id
                    )
                    FROM runs rr
                    INNER JOIN run_logs rl ON rl.run_id = rr.id
                    WHERE rr.run_key = paa.run_key
                      AND (rl.stream = 'worker:error' OR rl.stream LIKE '%stderr%')
                ), '') AS worker_error_log
         FROM prompt_requests pr
         LEFT JOIN LATERAL (
             SELECT raw_text, parsed_json, received_at FROM prompt_responses
             WHERE prompt_request_id = pr.id ORDER BY received_at DESC LIMIT 1
         ) pres ON true
         LEFT JOIN LATERAL (
             SELECT error_text, result_json, run_key
             FROM project_automation_attempts
             WHERE prompt_request_id = pr.id
             ORDER BY created_at DESC LIMIT 1
         ) paa ON true
         WHERE pr.project_id = $1::uuid AND ${condition}
         ORDER BY pr.created_at DESC LIMIT 30`,
        [projectId, nodeId]
    );
    const runCondition = kind === 'stage' ? 'r.stage_id = $2::uuid' : 'r.work_id = $2::uuid';
    const runs = await db.query(
        `SELECT r.id, r.run_key, r.status, r.exit_code, r.started_at, r.finished_at,
                r.result_json,
                COALESCE((SELECT string_agg(rl.chunk, '' ORDER BY rl.sequence_no)
                          FROM run_logs rl WHERE rl.run_id = r.id), '') AS log
         FROM runs r WHERE r.project_id = $1::uuid AND ${runCondition}
         ORDER BY r.created_at DESC LIMIT 30`,
        [projectId, nodeId]
    );
    const attemptCondition = kind === 'stage' ? 'paa.stage_id = $2::uuid' : 'paa.work_id = $2::uuid';
    const attempts = await db.query(
        `SELECT id, attempt, status, run_key, test_command, commit_sha,
                result_json, error_text, started_at, completed_at
         FROM project_automation_attempts paa
         WHERE project_id = $1::uuid AND ${attemptCondition}
         ORDER BY created_at DESC LIMIT 30`,
        [projectId, nodeId]
    );
    return { node: node.rows[0], prompts: prompts.rows, runs: runs.rows, attempts: attempts.rows };
}

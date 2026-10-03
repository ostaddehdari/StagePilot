import {
    createHash,
    randomUUID
} from 'node:crypto';

import {
    getDatabasePool
} from './db';


type JsonObject = Record<string, unknown>;

type PlanWork = {
    id: string;
    title: string;
    objective: string;
    dependsOn: string[];
    acceptanceCriteria: string[];
    weight: number;
};

type PlanStage = {
    id: string;
    title: string;
    objective: string;
    acceptanceCriteria: string[];
    weight: number;
    works: PlanWork[];
};

export type ProjectPlan = {
    schemaVersion: 'stagepilot.project-plan.v1';
    projectName: string;
    summary: string;
    technologies: Array<{
        area: string;
        choice: string;
        reason: string;
    }>;
    assumptions: string[];
    stages: PlanStage[];
};


function text(
    value: unknown,
    name: string,
    max = 10_000
): string {

    if (
        typeof value !== 'string'
        ||
        !value.trim()
    ) {

        throw new Error(
            `INVALID_${name.toUpperCase()}`
        );

    }

    const result = value.trim();

    if (result.length > max) {

        throw new Error(
            `${name.toUpperCase()}_TOO_LONG`
        );

    }

    return result;

}


function identifier(
    value: unknown,
    name: string
): string {

    const result = text(value, name, 64);

    if (!/^[A-Za-z][A-Za-z0-9_-]{1,63}$/.test(result)) {

        throw new Error(
            `INVALID_${name.toUpperCase()}_ID`
        );

    }

    return result;

}


function textArray(
    value: unknown,
    name: string,
    minimum = 1
): string[] {

    if (!Array.isArray(value)) {

        throw new Error(
            `INVALID_${name.toUpperCase()}`
        );

    }

    const result = value.map(
        (item, index) =>
            text(
                item,
                `${name}_${index + 1}`,
                2_000
            )
    );

    if (result.length < minimum) {

        throw new Error(
            `${name.toUpperCase()}_REQUIRED`
        );

    }

    return result;

}


function positiveWeight(
    value: unknown
): number {

    const number = Number(value ?? 1);

    if (
        !Number.isFinite(number)
        ||
        number <= 0
        ||
        number > 10_000
    ) {

        throw new Error(
            'INVALID_PLAN_WEIGHT'
        );

    }

    return number;

}


function objectValue(
    value: unknown,
    name: string
): JsonObject {

    if (
        !value
        ||
        typeof value !== 'object'
        ||
        Array.isArray(value)
    ) {

        throw new Error(
            `INVALID_${name.toUpperCase()}`
        );

    }

    return value as JsonObject;

}


export function validateProjectPlan(
    input: unknown
): ProjectPlan {

    const value = objectValue(
        input,
        'project_plan'
    );

    if (
        value.schemaVersion
        !==
        'stagepilot.project-plan.v1'
    ) {

        throw new Error(
            'UNSUPPORTED_PROJECT_PLAN_SCHEMA'
        );

    }

    if (
        !Array.isArray(value.stages)
        ||
        value.stages.length === 0
        ||
        value.stages.length > 100
    ) {

        throw new Error(
            'PROJECT_PLAN_REQUIRES_STAGES'
        );

    }

    const stageIds = new Set<string>();
    const workIds = new Set<string>();

    const stages = value.stages.map(
        (rawStage, stageIndex): PlanStage => {

            const stage = objectValue(
                rawStage,
                `stage_${stageIndex + 1}`
            );

            const id = identifier(
                stage.id,
                `stage_${stageIndex + 1}`
            );

            if (stageIds.has(id)) {

                throw new Error(
                    `DUPLICATE_STAGE_ID:${id}`
                );

            }

            stageIds.add(id);

            if (
                !Array.isArray(stage.works)
                ||
                stage.works.length === 0
                ||
                stage.works.length > 200
            ) {

                throw new Error(
                    `STAGE_REQUIRES_WORKS:${id}`
                );

            }

            const works = stage.works.map(
                (rawWork, workIndex): PlanWork => {

                    const work = objectValue(
                        rawWork,
                        `work_${workIndex + 1}`
                    );

                    const workId = identifier(
                        work.id,
                        `work_${workIndex + 1}`
                    );

                    if (workIds.has(workId)) {

                        throw new Error(
                            `DUPLICATE_WORK_ID:${workId}`
                        );

                    }

                    workIds.add(workId);

                    const dependsOn = Array.isArray(work.dependsOn)
                        ? work.dependsOn.map(
                            dependency =>
                                identifier(
                                    dependency,
                                    'dependency'
                                )
                        )
                        : [];

                    return {
                        id: workId,
                        title: text(work.title, 'work_title', 300),
                        objective: text(work.objective, 'work_objective', 5_000),
                        dependsOn,
                        acceptanceCriteria: textArray(
                            work.acceptanceCriteria,
                            'work_acceptance_criteria'
                        ),
                        weight: positiveWeight(work.weight)
                    };

                }
            );

            return {
                id,
                title: text(stage.title, 'stage_title', 300),
                objective: text(stage.objective, 'stage_objective', 5_000),
                acceptanceCriteria: textArray(
                    stage.acceptanceCriteria,
                    'stage_acceptance_criteria'
                ),
                weight: positiveWeight(stage.weight),
                works
            };

        }
    );

    for (const stage of stages) {

        for (const work of stage.works) {

            for (const dependency of work.dependsOn) {

                if (!workIds.has(dependency)) {

                    throw new Error(
                        `UNKNOWN_WORK_DEPENDENCY:${work.id}->${dependency}`
                    );

                }

                if (dependency === work.id) {

                    throw new Error(
                        `SELF_WORK_DEPENDENCY:${work.id}`
                    );

                }

            }

        }

    }

    const graph = new Map<string, string[]>();

    for (const stage of stages) {
        for (const work of stage.works) {
            graph.set(work.id, work.dependsOn);
        }
    }

    const visiting = new Set<string>();
    const visited = new Set<string>();

    const visit = (id: string) => {
        if (visiting.has(id)) {
            throw new Error(`CYCLIC_WORK_DEPENDENCY:${id}`);
        }
        if (visited.has(id)) {
            return;
        }
        visiting.add(id);
        for (const dependency of graph.get(id) ?? []) {
            visit(dependency);
        }
        visiting.delete(id);
        visited.add(id);
    };

    for (const id of graph.keys()) {
        visit(id);
    }

    const technologies = Array.isArray(value.technologies)
        ? value.technologies.map(
            (raw, index) => {
                const technology = objectValue(
                    raw,
                    `technology_${index + 1}`
                );
                return {
                    area: text(technology.area, 'technology_area', 120),
                    choice: text(technology.choice, 'technology_choice', 240),
                    reason: text(technology.reason, 'technology_reason', 2_000)
                };
            }
        )
        : [];

    return {
        schemaVersion: 'stagepilot.project-plan.v1',
        projectName: text(value.projectName, 'project_name', 160),
        summary: text(value.summary, 'plan_summary', 10_000),
        technologies,
        assumptions: Array.isArray(value.assumptions)
            ? textArray(value.assumptions, 'assumptions', 0)
            : [],
        stages
    };
}


export function buildProjectPlanningPrompt({
    projectName,
    requestText,
    description,
    messages
}: {
    projectName: string;
    requestText: string;
    description: string | null;
    messages: Array<{ role: string; content: string }>;
}) {

    const conversation = messages
        .slice(-30)
        .map(message => `${message.role.toUpperCase()}: ${message.content}`)
        .join('\n\n');

    return [
        'STAGEPILOT_PROJECT_DISCOVERY_V2',
        `PROJECT_NAME: ${projectName}`,
        `DESCRIPTION:\n${description ?? ''}`,
        `INITIAL_IDEA:\n${requestText}`,
        conversation ? `DISCUSSION:\n${conversation}` : '',
        `TASK:
1. Evaluate the idea in plain language.
2. Recommend practical backend, frontend, database, queue, deployment and testing choices with trade-offs.
3. Respect every constraint in the discussion.
4. When enough information exists, produce a detailed Stage/Work plan.
5. Each Work must have at least one verifiable acceptance criterion.
6. Dependencies must reference valid Work ids and must not contain cycles.

Return exactly one JSON object and no Markdown fence:
{
  "responseType": "project_plan",
  "summary": "short evaluation",
  "plan": {
    "schemaVersion": "stagepilot.project-plan.v1",
    "projectName": "...",
    "summary": "...",
    "technologies": [{"area":"backend","choice":"...","reason":"..."}],
    "assumptions": ["..."],
    "stages": [{
      "id": "S01",
      "title": "...",
      "objective": "...",
      "weight": 1,
      "acceptanceCriteria": ["..."],
      "works": [{
        "id": "S01-W01",
        "title": "...",
        "objective": "...",
        "weight": 1,
        "dependsOn": [],
        "acceptanceCriteria": ["..."]
      }]
    }]
  }
}`
    ].filter(Boolean).join('\n\n');
}


export async function getPlanningWorkspace(
    projectId: string
) {

    const db = getDatabasePool();

    const [projectResult, messagesResult, plansResult, promptResult] =
        await Promise.all([
            db.query(
                `SELECT id, name, slug, description, status, settings,
                        current_plan_revision, created_at, updated_at
                 FROM projects
                 WHERE id = $1::uuid AND deleted_at IS NULL`,
                [projectId]
            ),
            db.query(
                `SELECT id, revision, role, message_type, content, payload, created_at
                 FROM project_planning_messages
                 WHERE project_id = $1::uuid
                 ORDER BY created_at ASC
                 LIMIT 300`,
                [projectId]
            ),
            db.query(
                `SELECT id, version, status, title, summary, proposal_json, proposal_html,
                        source_response_id, created_by, approved_at, created_at, updated_at
                 FROM project_plan_versions
                 WHERE project_id = $1::uuid
                 ORDER BY version DESC`,
                [projectId]
            ),
            db.query(
                `SELECT id, request_key, request_type, status, last_error,
                        created_at, completed_at
                 FROM prompt_requests
                 WHERE project_id = $1::uuid
                   AND request_type = 'project_plan'
                 ORDER BY created_at DESC
                 LIMIT 20`,
                [projectId]
            )
        ]);

    if (projectResult.rowCount !== 1) {
        return null;
    }

    return {
        project: projectResult.rows[0],
        messages: messagesResult.rows,
        plans: plansResult.rows,
        promptRequests: promptResult.rows
    };
}


export async function addPlanningMessage(
    projectId: string,
    input: {
        role?: unknown;
        messageType?: unknown;
        content?: unknown;
    }
) {

    const role = text(input.role ?? 'user', 'message_role', 20);
    const messageType = text(input.messageType ?? 'comment', 'message_type', 30);
    const content = text(input.content, 'message_content', 30_000);

    if (!['user', 'assistant', 'system'].includes(role)) {
        throw new Error('INVALID_PLANNING_MESSAGE_ROLE');
    }

    if (!['idea', 'evaluation', 'technology', 'proposal', 'comment', 'decision', 'prompt'].includes(messageType)) {
        throw new Error('INVALID_PLANNING_MESSAGE_TYPE');
    }

    const db = getDatabasePool();
    const result = await db.query(
        `INSERT INTO project_planning_messages (
            project_id, revision, role, message_type, content
         )
         SELECT $1::uuid, GREATEST(current_plan_revision, 1), $2, $3, $4
         FROM projects
         WHERE id = $1::uuid AND deleted_at IS NULL
         RETURNING id, revision, role, message_type, content, payload, created_at`,
        [projectId, role, messageType, content]
    );

    if (result.rowCount !== 1) {
        throw new Error('PROJECT_NOT_FOUND');
    }

    return result.rows[0];
}


export async function requestPlanningEvaluation(
    projectId: string
) {

    const db = getDatabasePool();
    const client = await db.connect();

    try {
        await client.query('BEGIN');

        const projectResult = await client.query(
            `SELECT p.id, p.name, p.description, p.current_plan_revision,
                    p.selected_chat_account_id,
                    r.request_text,
                    c.id AS conversation_id
             FROM projects p
             INNER JOIN project_revisions r
                ON r.project_id = p.id
               AND r.revision = (
                    SELECT MIN(revision)
                    FROM project_revisions
                    WHERE project_id = p.id
               )
             LEFT JOIN LATERAL (
                SELECT id
                FROM conversations
                WHERE project_id = p.id
                  AND status IN ('active', 'pending_creation')
                ORDER BY sequence_no DESC
                LIMIT 1
             ) c ON true
             WHERE p.id = $1::uuid
               AND p.deleted_at IS NULL
             FOR UPDATE OF p`,
            [projectId]
        );

        if (projectResult.rowCount !== 1) {
            throw new Error('PROJECT_NOT_FOUND');
        }

        const project = projectResult.rows[0];

        if (!project.selected_chat_account_id) {

            const accountResult = await client.query(
                `SELECT id
                 FROM chat_accounts
                 WHERE deleted_at IS NULL
                   AND status IN ('ready', 'authenticated')
                 ORDER BY updated_at DESC
                 LIMIT 1`
            );

            if (accountResult.rowCount !== 1) {
                throw new Error('PROJECT_CHAT_ACCOUNT_REQUIRED');
            }

            project.selected_chat_account_id = accountResult.rows[0].id;
            await client.query(
                `UPDATE projects
                 SET selected_chat_account_id = $2::uuid, updated_at = now()
                 WHERE id = $1::uuid`,
                [projectId, project.selected_chat_account_id]
            );

        }

        if (!project.conversation_id) {

            const sequenceResult = await client.query(
                `SELECT COALESCE(MAX(sequence_no), 0) + 1 AS next_sequence
                 FROM conversations
                 WHERE project_id = $1::uuid`,
                [projectId]
            );

            const conversationResult = await client.query(
                `INSERT INTO conversations (
                    project_id, chat_account_id, status, sequence_no,
                    started_reason, metadata
                 )
                 VALUES (
                    $1::uuid, $2::uuid, 'pending_creation', $3,
                    'automatic_planning_cycle',
                    jsonb_build_object('mode', 'new', 'automatic', true)
                 )
                 RETURNING id`,
                [
                    projectId,
                    project.selected_chat_account_id,
                    Number(sequenceResult.rows[0].next_sequence)
                ]
            );

            project.conversation_id = conversationResult.rows[0].id;

        }

        const messagesResult = await client.query(
            `SELECT role, content
             FROM project_planning_messages
             WHERE project_id = $1::uuid
             ORDER BY created_at ASC
             LIMIT 300`,
            [projectId]
        );

        const promptText = buildProjectPlanningPrompt({
            projectName: project.name,
            requestText: project.request_text,
            description: project.description,
            messages: messagesResult.rows
        });

        const digest = createHash('sha256')
            .update(promptText, 'utf8')
            .digest('hex');
        const requestKey = `plan:${projectId}:${Date.now()}:${digest.slice(0, 12)}`;

        const templateResult = await client.query(
            `SELECT id
             FROM prompt_templates
             WHERE template_key = 'project-discovery-and-plan'
               AND version = '2'
               AND active = true
             LIMIT 1`
        );

        const requestResult = await client.query(
            `INSERT INTO prompt_requests (
                project_id, conversation_id, template_id, request_key,
                request_type, prompt_text, context_json, state_revision, status
             )
             VALUES (
                $1::uuid, $2::uuid, $3::uuid, $4,
                'project_plan', $5,
                jsonb_build_object(
                    'promptSha256', $6::text,
                    'planRevision', $7::integer,
                    'source', 'planning_workspace'
                ),
                $7,
                'created'
             )
             RETURNING id, request_key, request_type, status, created_at`,
            [
                projectId,
                project.conversation_id,
                templateResult.rows[0]?.id ?? null,
                requestKey,
                promptText,
                digest,
                project.current_plan_revision
            ]
        );

        await client.query(
            `INSERT INTO project_planning_messages (
                project_id, revision, role, message_type, content, payload
             )
             VALUES (
                $1::uuid, $2, 'system', 'prompt',
                'درخواست ارزیابی و تولید پروپوزال برای ChatGPT ثبت شد.',
                jsonb_build_object('promptRequestId', $3::uuid, 'requestKey', $4::text)
             )`,
            [
                projectId,
                project.current_plan_revision,
                requestResult.rows[0].id,
                requestKey
            ]
        );

        await client.query('COMMIT');
        return requestResult.rows[0];
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}


export async function saveProjectPlan(
    projectId: string,
    input: {
        plan?: unknown;
        rawJson?: unknown;
        createdBy?: unknown;
        summary?: unknown;
    }
) {

    let rawPlan = input.plan;

    if (typeof input.rawJson === 'string') {
        try {
            const parsed = JSON.parse(input.rawJson);
            rawPlan = parsed?.responseType === 'project_plan'
                ? parsed.plan
                : parsed;
        } catch {
            throw new Error('INVALID_PROJECT_PLAN_JSON');
        }
    }

    const plan = validateProjectPlan(rawPlan);
    const createdBy = typeof input.createdBy === 'string'
        && ['user', 'assistant', 'import', 'system'].includes(input.createdBy)
        ? input.createdBy
        : 'import';

    const db = getDatabasePool();
    const client = await db.connect();

    try {
        await client.query('BEGIN');

        const projectResult = await client.query(
            `SELECT id
             FROM projects
             WHERE id = $1::uuid AND deleted_at IS NULL
             FOR UPDATE`,
            [projectId]
        );

        if (projectResult.rowCount !== 1) {
            throw new Error('PROJECT_NOT_FOUND');
        }

        const versionResult = await client.query(
            `SELECT COALESCE(MAX(version), 0) + 1 AS next_version
             FROM project_plan_versions
             WHERE project_id = $1::uuid`,
            [projectId]
        );
        const version = Number(versionResult.rows[0].next_version);

        const result = await client.query(
            `INSERT INTO project_plan_versions (
                project_id, version, status, title, summary,
                proposal_json, created_by
             )
             VALUES ($1::uuid, $2, 'review', $3, $4, $5::jsonb, $6)
             RETURNING *`,
            [
                projectId,
                version,
                plan.projectName,
                typeof input.summary === 'string' && input.summary.trim()
                    ? input.summary.trim()
                    : plan.summary,
                JSON.stringify(plan),
                createdBy
            ]
        );

        await client.query(
            `INSERT INTO project_planning_messages (
                project_id, revision, role, message_type, content, payload
             )
             VALUES (
                $1::uuid, $2, 'assistant', 'proposal', $3,
                jsonb_build_object('planVersion', $2)
             )`,
            [projectId, version, plan.summary]
        );

        await client.query(
            `UPDATE projects
             SET settings = settings || jsonb_build_object(
                    'planningStatus', 'proposal_review',
                    'latestPlanVersion', $2::integer
                 ),
                 updated_at = now()
             WHERE id = $1::uuid`,
            [projectId, version]
        );

        await client.query('COMMIT');
        return result.rows[0];
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}


export async function approveProjectPlan(
    projectId: string,
    planVersion: number,
    repositoryNameInput?: unknown
) {

    if (!Number.isInteger(planVersion) || planVersion < 1) {
        throw new Error('INVALID_PLAN_VERSION');
    }

    const repositoryName = typeof repositoryNameInput === 'string'
        ? repositoryNameInput.trim()
        : '';

    if (repositoryName && !/^[A-Za-z0-9._-]{1,100}$/.test(repositoryName)) {
        throw new Error('INVALID_REPOSITORY_NAME');
    }

    const db = getDatabasePool();
    const client = await db.connect();

    try {
        await client.query('BEGIN');

        const planResult = await client.query(
            `SELECT *
             FROM project_plan_versions
             WHERE project_id = $1::uuid AND version = $2
             FOR UPDATE`,
            [projectId, planVersion]
        );

        if (planResult.rowCount !== 1) {
            throw new Error('PROJECT_PLAN_NOT_FOUND');
        }

        const plan = validateProjectPlan(
            planResult.rows[0].proposal_json
        );

        await client.query(
            `UPDATE project_plan_versions
             SET status = 'superseded', updated_at = now()
             WHERE project_id = $1::uuid
               AND status = 'approved'
               AND version <> $2`,
            [projectId, planVersion]
        );

        await client.query(
            `UPDATE project_plan_versions
             SET status = 'approved', approved_at = now(), updated_at = now()
             WHERE project_id = $1::uuid AND version = $2`,
            [projectId, planVersion]
        );

        await client.query(
            `INSERT INTO project_revisions (
                project_id, revision, source, request_text,
                plan_json, approved, approved_at
             )
             VALUES (
                $1::uuid, $2, 'planning_workspace', NULL,
                $3::jsonb, true, now()
             )
             ON CONFLICT (project_id, revision) DO UPDATE
             SET plan_json = EXCLUDED.plan_json,
                 approved = true,
                 approved_at = now(),
                 source = EXCLUDED.source`,
            [projectId, planVersion, JSON.stringify(plan)]
        );

        await client.query(
            `DELETE FROM stages
             WHERE project_id = $1::uuid AND revision = $2`,
            [projectId, planVersion]
        );

        const workIds = new Map<string, string>();

        for (let stageIndex = 0; stageIndex < plan.stages.length; stageIndex += 1) {
            const stage = plan.stages[stageIndex];
            const stageResult = await client.query(
                `INSERT INTO stages (
                    id, project_id, revision, stage_key, title, description,
                    position, weight, status, acceptance_criteria, metadata
                 )
                 VALUES (
                    $1::uuid, $2::uuid, $3, $4, $5, $6,
                    $7, $8, 'pending', $9::jsonb,
                    jsonb_build_object('sourcePlanVersion', $3::integer)
                 )
                 RETURNING id`,
                [
                    randomUUID(), projectId, planVersion, stage.id,
                    stage.title, stage.objective, stageIndex + 1, stage.weight,
                    JSON.stringify(stage.acceptanceCriteria)
                ]
            );
            const stageDbId = stageResult.rows[0].id;

            for (let workIndex = 0; workIndex < stage.works.length; workIndex += 1) {
                const work = stage.works[workIndex];
                const workDbId = randomUUID();
                workIds.set(work.id, workDbId);
                await client.query(
                    `INSERT INTO works (
                        id, stage_id, work_key, title, description, position,
                        weight, status, acceptance_criteria, dependencies, metadata
                     )
                     VALUES (
                        $1::uuid, $2::uuid, $3, $4, $5, $6,
                        $7, 'pending', $8::jsonb, $9::jsonb,
                        jsonb_build_object('sourcePlanVersion', $10::integer)
                     )`,
                    [
                        workDbId, stageDbId, work.id, work.title,
                        work.objective, workIndex + 1, work.weight,
                        JSON.stringify(work.acceptanceCriteria),
                        JSON.stringify(work.dependsOn), planVersion
                    ]
                );
            }
        }

        await client.query(
            `UPDATE projects
             SET name = $2,
                 status = 'active',
                 current_plan_revision = $3,
                 settings = settings || jsonb_build_object(
                    'planningStatus', 'approved',
                    'approvedPlanVersion', $3::integer,
                    'automationMode', 'automatic',
                    'automationStatus', 'queued',
                    'repositoryName', COALESCE(
                        NULLIF($4::text, ''),
                        NULLIF(settings->>'repositoryName', ''),
                        slug
                    )
                 ),
                 updated_at = now()
             WHERE id = $1::uuid AND deleted_at IS NULL`,
            [projectId, plan.projectName, planVersion, repositoryName]
        );

        await client.query(
            `INSERT INTO project_automation_state (
                project_id, status, mode, max_work_attempts, started_at, metadata
             ) VALUES (
                $1::uuid, 'queued', 'automatic', 3, now(),
                jsonb_build_object(
                    'approvedPlanVersion', $2::integer,
                    'startedBy', 'plan_approval'
                )
             )
             ON CONFLICT (project_id) DO UPDATE SET
                status = 'queued', mode = 'automatic',
                current_stage_id = NULL, current_work_id = NULL,
                lease_owner = NULL, lease_expires_at = NULL,
                last_error = NULL, completed_at = NULL,
                started_at = COALESCE(project_automation_state.started_at, now()),
                metadata = project_automation_state.metadata || EXCLUDED.metadata,
                updated_at = now()`,
            [projectId, planVersion]
        );

        await client.query(
            `INSERT INTO project_planning_messages (
                project_id, revision, role, message_type, content, payload
             )
             VALUES (
                $1::uuid, $2, 'user', 'decision',
                'پروپوزال تصویب شد و Stage/Workها به خط مبنای اجرایی تبدیل شدند.',
                jsonb_build_object('planVersion', $2)
             )`,
            [projectId, planVersion]
        );

        await client.query(
            `INSERT INTO events (
                project_id, entity_type, entity_id, event_type, severity,
                actor_type, actor_id, message, data
             )
             VALUES (
                $1::uuid, 'project', $1::text, 'project.plan.approved', 'info',
                'user', 'private-admin',
                'Project plan approved and materialized.',
                jsonb_build_object('planVersion', $2::integer)
             )`,
            [projectId, planVersion]
        );

        await client.query('COMMIT');
        return {
            projectId,
            planVersion,
            stageCount: plan.stages.length,
            workCount: workIds.size,
            status: 'approved'
        };
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}

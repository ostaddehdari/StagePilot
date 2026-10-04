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

export type ProjectProposal = {
    schemaVersion: 'stagepilot.project-proposal.v1';
    title: string;
    executiveSummary: string;
    problemStatement: string;
    objectives: string[];
    targetUsers: string[];
    scope: {
        inScope: string[];
        outOfScope: string[];
    };
    functionalRequirements: Array<{
        id: string;
        title: string;
        description: string;
        priority: string;
        acceptanceCriteria: string[];
    }>;
    nonFunctionalRequirements: string[];
    architecture: {
        overview: string;
        components: string[];
        integrations: string[];
        security: string[];
        operations: string[];
    };
    technologyRecommendations: Array<{
        area: string;
        choice: string;
        rationale: string;
        tradeoffs: string[];
    }>;
    qualityStrategy: {
        testLevels: string[];
        stageExitPolicy: string[];
        observability: string[];
    };
    delivery: {
        assumptions: string[];
        constraints: string[];
        risks: string[];
    };
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


export function validateProjectProposal(
    input: unknown
): ProjectProposal {

    const value = objectValue(input, 'project_proposal');

    if (value.schemaVersion !== 'stagepilot.project-proposal.v1') {
        throw new Error('UNSUPPORTED_PROJECT_PROPOSAL_SCHEMA');
    }

    const scope = objectValue(value.scope, 'proposal_scope');
    const architecture = objectValue(value.architecture, 'proposal_architecture');
    const quality = objectValue(value.qualityStrategy, 'proposal_quality_strategy');
    const delivery = objectValue(value.delivery, 'proposal_delivery');

    if (!Array.isArray(value.functionalRequirements) || value.functionalRequirements.length === 0) {
        throw new Error('PROPOSAL_FUNCTIONAL_REQUIREMENTS_REQUIRED');
    }

    const functionalRequirements = value.functionalRequirements.map((raw, index) => {
        const requirement = objectValue(raw, `functional_requirement_${index + 1}`);
        return {
            id: text(requirement.id, 'functional_requirement_id', 40),
            title: text(requirement.title, 'functional_requirement_title', 300),
            description: text(requirement.description, 'functional_requirement_description', 5_000),
            priority: typeof requirement.priority === 'string' && requirement.priority.trim()
                ? requirement.priority.trim().slice(0, 40)
                : 'must',
            acceptanceCriteria: textArray(
                requirement.acceptanceCriteria,
                'functional_requirement_acceptance_criteria'
            )
        };
    });

    const technologyRecommendations = Array.isArray(value.technologyRecommendations)
        ? value.technologyRecommendations.map((raw, index) => {
            const technology = objectValue(raw, `proposal_technology_${index + 1}`);
            return {
                area: text(technology.area, 'proposal_technology_area', 120),
                choice: text(technology.choice, 'proposal_technology_choice', 300),
                rationale: text(technology.rationale, 'proposal_technology_rationale', 3_000),
                tradeoffs: Array.isArray(technology.tradeoffs)
                    ? textArray(technology.tradeoffs, 'proposal_technology_tradeoffs', 0)
                    : []
            };
        })
        : [];

    return {
        schemaVersion: 'stagepilot.project-proposal.v1',
        title: text(value.title, 'proposal_title', 300),
        executiveSummary: text(value.executiveSummary, 'proposal_executive_summary', 30_000),
        problemStatement: text(value.problemStatement, 'proposal_problem_statement', 30_000),
        objectives: textArray(value.objectives, 'proposal_objectives'),
        targetUsers: textArray(value.targetUsers, 'proposal_target_users'),
        scope: {
            inScope: textArray(scope.inScope, 'proposal_in_scope'),
            outOfScope: Array.isArray(scope.outOfScope)
                ? textArray(scope.outOfScope, 'proposal_out_of_scope', 0)
                : []
        },
        functionalRequirements,
        nonFunctionalRequirements: Array.isArray(value.nonFunctionalRequirements)
            ? textArray(value.nonFunctionalRequirements, 'proposal_non_functional_requirements', 0)
            : [],
        architecture: {
            overview: text(architecture.overview, 'proposal_architecture_overview', 30_000),
            components: textArray(architecture.components, 'proposal_architecture_components'),
            integrations: Array.isArray(architecture.integrations)
                ? textArray(architecture.integrations, 'proposal_architecture_integrations', 0)
                : [],
            security: Array.isArray(architecture.security)
                ? textArray(architecture.security, 'proposal_architecture_security', 0)
                : [],
            operations: Array.isArray(architecture.operations)
                ? textArray(architecture.operations, 'proposal_architecture_operations', 0)
                : []
        },
        technologyRecommendations,
        qualityStrategy: {
            testLevels: textArray(quality.testLevels, 'proposal_test_levels'),
            stageExitPolicy: textArray(quality.stageExitPolicy, 'proposal_stage_exit_policy'),
            observability: Array.isArray(quality.observability)
                ? textArray(quality.observability, 'proposal_observability', 0)
                : []
        },
        delivery: {
            assumptions: Array.isArray(delivery.assumptions)
                ? textArray(delivery.assumptions, 'proposal_assumptions', 0)
                : [],
            constraints: Array.isArray(delivery.constraints)
                ? textArray(delivery.constraints, 'proposal_constraints', 0)
                : [],
            risks: Array.isArray(delivery.risks)
                ? textArray(delivery.risks, 'proposal_risks', 0)
                : []
        }
    };
}


function escapeHtml(value: unknown) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}


function proposalHtml(proposal: ProjectProposal) {
    const list = (items: string[]) => `<ul>${items.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`;
    return `<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><style>body{font-family:Vazirmatn,Tahoma,sans-serif;line-height:2;color:#172033;padding:32px;max-width:1100px;margin:auto}h1,h2{color:#312e81}section{margin:18px 0;padding:18px;border:1px solid #e4e7ec;border-radius:16px;background:#fff}.req{margin:10px 0;padding:12px;border-right:4px solid #6366f1;background:#f8faff}small{color:#667085}</style></head><body><h1>${escapeHtml(proposal.title)}</h1><section><h2>خلاصه اجرایی</h2><p>${escapeHtml(proposal.executiveSummary)}</p></section><section><h2>مسئله و اهداف</h2><p>${escapeHtml(proposal.problemStatement)}</p>${list(proposal.objectives)}</section><section><h2>دامنه</h2><h3>داخل دامنه</h3>${list(proposal.scope.inScope)}<h3>خارج از دامنه</h3>${list(proposal.scope.outOfScope)}</section><section><h2>نیازمندی‌های عملکردی</h2>${proposal.functionalRequirements.map(item => `<div class="req"><strong>${escapeHtml(item.id)} — ${escapeHtml(item.title)}</strong><p>${escapeHtml(item.description)}</p><small>${escapeHtml(item.priority)}</small>${list(item.acceptanceCriteria)}</div>`).join('')}</section><section><h2>معماری پیشنهادی</h2><p>${escapeHtml(proposal.architecture.overview)}</p>${list(proposal.architecture.components)}</section><section><h2>کیفیت و خروج هر Stage</h2>${list(proposal.qualityStrategy.testLevels)}${list(proposal.qualityStrategy.stageExitPolicy)}</section></body></html>`;
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


export function buildProjectProposalPrompt({
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
        'STAGEPILOT_PROFESSIONAL_PROPOSAL_V1',
        `PROJECT_NAME: ${projectName}`,
        `DESCRIPTION:\n${description ?? ''}`,
        `INITIAL_IDEA:\n${requestText}`,
        conversation ? `DISCUSSION:\n${conversation}` : '',
        `ROLE:
You are a senior product strategist, solution architect, UX lead, security engineer and delivery manager.

TASK:
1. Turn the initial idea and complete discussion into a professional, implementation-ready project proposal.
2. Resolve contradictions in favor of the newest explicit user instruction. Never invent a confirmed fact; list uncertainty as assumptions or risks.
3. Define measurable objectives, target users, boundaries, prioritized requirements and testable acceptance criteria.
4. Recommend practical frontend, backend, database, queue, AI, security, observability, deployment and testing technologies with rationale and trade-offs.
5. Include architecture, integrations, security, operations, non-functional requirements, quality strategy and a strict Stage exit policy.
6. Write proposalMarkdown in professional Persian for direct review by a non-technical project owner.
7. Do NOT create Stage/Work items yet. This is the official proposal candidate only.

Return exactly one JSON object and no Markdown fence:
{
  "responseType": "project_proposal",
  "summary": "خلاصه کوتاه نتیجه تحلیل",
  "proposalMarkdown": "پروپوزال کامل و خوانا به زبان فارسی",
  "proposal": {
    "schemaVersion": "stagepilot.project-proposal.v1",
    "title": "...",
    "executiveSummary": "...",
    "problemStatement": "...",
    "objectives": ["..."],
    "targetUsers": ["..."],
    "scope": {"inScope":["..."],"outOfScope":["..."]},
    "functionalRequirements": [{"id":"FR-01","title":"...","description":"...","priority":"must","acceptanceCriteria":["..."]}],
    "nonFunctionalRequirements": ["..."],
    "architecture": {"overview":"...","components":["..."],"integrations":["..."],"security":["..."],"operations":["..."]},
    "technologyRecommendations": [{"area":"backend","choice":"...","rationale":"...","tradeoffs":["..."]}],
    "qualityStrategy": {"testLevels":["..."],"stageExitPolicy":["..."],"observability":["..."]},
    "delivery": {"assumptions":["..."],"constraints":["..."],"risks":["..."]}
  }
}`
    ].filter(Boolean).join('\n\n');
}


export function buildProjectPlanTreePrompt({
    projectName,
    proposal,
    settings
}: {
    projectName: string;
    proposal: ProjectProposal;
    settings: JsonObject;
}) {
    return [
        'STAGEPILOT_PROPOSAL_TO_PLAN_TREE_V1',
        `PROJECT_NAME: ${projectName}`,
        `REPOSITORY_NAME: ${String(settings.repositoryName ?? '')}`,
        `PUBLIC_SITE_ORIGIN: ${String(settings.publicOrigin ?? 'https://srun.ir/StagePilot')}`,
        `OFFICIAL_PROPOSAL_JSON:\n${JSON.stringify(proposal, null, 2)}`,
        `ROLE:
You are a principal software architect, technical program manager, DevOps engineer and QA lead.

TASK:
Convert the approved proposal into a complete, dependency-safe, execution-ready Stage/Work tree.

MANDATORY PLANNING RULES:
1. Treat OFFICIAL_PROPOSAL_JSON as the authoritative scope and preserve every accepted requirement.
2. Use stable IDs S01, S02... and S01-W01, S01-W02... . Dependencies must reference valid Work IDs and contain no cycles.
3. Make every Work small enough for one controlled AI execution cycle with concrete, independently verifiable acceptance criteria.
4. Include architecture, database/migrations, backend/API, frontend/UX, security, observability, documentation, deployment and operations where applicable.
5. Always include a dedicated deployment Work that creates the public page/route on the configured site URL, configures and validates Nginx reverse-proxy/static routing, preserves HTTPS/base-path behavior, exposes a health check and verifies the public URL with an HTTP smoke test.
6. Every implementation Work must finish with relevant automated tests and evidence. Generated code alone never completes a Work.
7. The FINAL Work of EVERY Stage must be titled "Stage Exit Verification" and run applicable build, lint/typecheck, unit, integration, security, migration, browser/E2E, HTTP smoke and regression tests. All must pass before the next Stage.
8. Every Work must inspect its diff, exclude secrets/runtime files, commit only after tests pass with a Work-specific message and record the commit SHA.
9. Push every successful Work commit to the configured GitHub repository/branch and verify the remote SHA. Every Stage Exit Verification confirms all Stage commits exist on GitHub.
10. The final Stage must cover production deployment, Nginx validation/reload, public URL E2E verification, monitoring/log verification, rollback evidence, final GitHub sync and completion acceptance.
11. Produce pending executable nodes only; never mark a Stage or Work done in this response.

Return exactly one JSON object and no Markdown fence:
{
  "responseType": "project_plan",
  "summary": "خلاصه ساخت درخت اجرایی",
  "plan": {
    "schemaVersion": "stagepilot.project-plan.v1",
    "projectName": "...",
    "summary": "...",
    "technologies": [{"area":"backend","choice":"...","reason":"..."}],
    "assumptions": ["..."],
    "stages": [{
      "id": "S01", "title": "...", "objective": "...", "weight": 1,
      "acceptanceCriteria": ["all stage tests pass", "all commits are verified on GitHub"],
      "works": [{
        "id": "S01-W01", "title": "...", "objective": "...", "weight": 1,
        "dependsOn": [],
        "acceptanceCriteria": ["verifiable result", "tests pass", "commit SHA and GitHub remote SHA recorded"]
      }]
    }]
  }
}`
    ].join('\n\n');
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
                   AND deleted_at IS NULL
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
                        context_json, send_attempts, claimed_at, sent_at,
                        claimed_by, next_attempt_at, created_at, completed_at
                 FROM prompt_requests
                 WHERE project_id = $1::uuid
                   AND request_type IN (
                        'project_plan', 'project_proposal', 'project_plan_tree'
                   )
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
        promptRequests: promptResult.rows,
        officialProposal:
            projectResult.rows[0].settings?.officialProposal ?? null
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

    if (![
        'idea', 'evaluation', 'technology', 'proposal', 'proposal_draft',
        'official_proposal', 'plan_tree', 'comment', 'decision', 'prompt'
    ].includes(messageType)) {
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
    projectId: string,
    workflowInput: unknown = 'proposal'
) {

    const workflow = workflowInput === 'plan_tree' ? 'plan_tree' : 'proposal';
    const requestType = workflow === 'plan_tree'
        ? 'project_plan_tree'
        : 'project_proposal';

    const db = getDatabasePool();
    const client = await db.connect();

    try {
        await client.query('BEGIN');

        const projectResult = await client.query(
            `SELECT p.id, p.name, p.description, p.current_plan_revision,
                    p.settings,
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

        const activeRequestResult = await client.query(
            `SELECT id, request_key, request_type, status, created_at,
                    true AS already_active
             FROM prompt_requests
             WHERE project_id = $1::uuid
               AND request_type IN (
                    'project_plan', 'project_proposal', 'project_plan_tree'
               )
               AND status IN (
                    'created', 'retry', 'processing',
                    'sent', 'waiting_response'
               )
             ORDER BY created_at DESC
             LIMIT 1`,
            [projectId]
        );

        if (activeRequestResult.rowCount === 1) {
            await client.query('COMMIT');
            return activeRequestResult.rows[0];
        }

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
               AND deleted_at IS NULL
               AND role IN ('user', 'assistant')
             ORDER BY created_at ASC
             LIMIT 300`,
            [projectId]
        );

        const promptText = workflow === 'plan_tree'
            ? buildProjectPlanTreePrompt({
                projectName: project.name,
                proposal: validateProjectProposal(
                    project.settings?.officialProposal?.proposal
                ),
                settings: project.settings ?? {}
            })
            : buildProjectProposalPrompt({
                projectName: project.name,
                requestText: project.request_text,
                description: project.description,
                messages: messagesResult.rows
            });

        const digest = createHash('sha256')
            .update(promptText, 'utf8')
            .digest('hex');
        const requestKey = `${workflow}:${projectId}:${Date.now()}:${digest.slice(0, 12)}`;

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
                $8::text, $5,
                jsonb_build_object(
                    'promptSha256', $6::text,
                    'planRevision', $7::integer,
                    'source', 'planning_workspace',
                    'workflow', $9::text
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
                project.current_plan_revision,
                requestType,
                workflow
            ]
        );

        await client.query(
            `INSERT INTO project_planning_messages (
                project_id, revision, role, message_type, content, payload
             )
             VALUES (
                $1::uuid, $2, 'system', 'prompt',
                $5::text,
                jsonb_build_object('promptRequestId', $3::uuid, 'requestKey', $4::text)
             )`,
            [
                projectId,
                project.current_plan_revision,
                requestResult.rows[0].id,
                requestKey,
                workflow === 'plan_tree'
                    ? 'درخواست تبدیل پروپوزال رسمی به Stage و Work برای ChatGPT ثبت شد.'
                    : 'درخواست ساخت پروپوزال حرفه‌ای برای ChatGPT ثبت شد.'
            ]
        );

        await client.query(
            `INSERT INTO events (
                project_id, entity_type, entity_id, event_type, severity,
                actor_type, actor_id, message, data
             ) VALUES (
                $1::uuid, 'prompt_request', $2::text,
                'planning.request.queued', 'info', 'user', 'private-admin',
                $6::text,
                jsonb_build_object(
                    'requestKey', $3::text,
                    'conversationId', $4::uuid,
                    'chatAccountId', $5::uuid
                )
             )`,
            [
                projectId,
                requestResult.rows[0].id,
                requestKey,
                project.conversation_id,
                project.selected_chat_account_id,
                workflow === 'plan_tree'
                    ? 'درخواست ساخت PLAN TREE در صف ChatGPT قرار گرفت.'
                    : 'درخواست ساخت پروپوزال حرفه‌ای در صف ChatGPT قرار گرفت.'
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


export async function deletePlanningMessage(
    projectId: string,
    messageId: string
) {
    const db = getDatabasePool();
    const result = await db.query(
        `UPDATE project_planning_messages
         SET deleted_at = now(), deleted_by = 'private-admin'
         WHERE id = $2::uuid
           AND project_id = $1::uuid
           AND deleted_at IS NULL
         RETURNING id, message_type, created_at`,
        [projectId, messageId]
    );
    if (result.rowCount !== 1) throw new Error('PLANNING_MESSAGE_NOT_FOUND');
    await db.query(
        `INSERT INTO events (
            project_id, entity_type, entity_id, event_type, severity,
            actor_type, actor_id, message, data
         ) VALUES (
            $1::uuid, 'planning_message', $2::text,
            'planning.message.deleted', 'info', 'user', 'private-admin',
            'پیام گفت‌وگو از نمای پروژه حذف شد.',
            jsonb_build_object('messageType', $3::text)
         )`,
        [projectId, messageId, result.rows[0].message_type]
    );
    return { deleted: true, id: result.rows[0].id };
}


export async function finalizeOfficialProposal(
    projectId: string,
    messageId: string
) {
    const db = getDatabasePool();
    const client = await db.connect();
    try {
        await client.query('BEGIN');
        const result = await client.query(
            `SELECT m.id, m.content, m.payload, p.settings,
                    p.current_plan_revision
             FROM project_planning_messages m
             JOIN projects p ON p.id = m.project_id
             WHERE m.id = $2::uuid
               AND m.project_id = $1::uuid
               AND m.role = 'assistant'
               AND m.message_type = 'proposal_draft'
               AND m.deleted_at IS NULL
               AND p.deleted_at IS NULL
             FOR UPDATE OF p`,
            [projectId, messageId]
        );
        if (result.rowCount !== 1) throw new Error('PROPOSAL_DRAFT_NOT_FOUND');
        const row = result.rows[0];
        const proposal = validateProjectProposal(row.payload?.proposal);
        const previousVersion = Number(row.settings?.officialProposal?.version ?? 0);
        const officialProposal = {
            version: previousVersion + 1,
            status: 'approved',
            title: proposal.title,
            summary: proposal.executiveSummary,
            proposal,
            proposalMarkdown: row.content,
            proposalHtml: proposalHtml(proposal),
            sourceMessageId: messageId,
            finalizedAt: new Date().toISOString()
        };
        await client.query(
            `UPDATE projects
             SET settings = COALESCE(settings, '{}'::jsonb) || jsonb_build_object(
                    'officialProposal', $2::jsonb,
                    'planningStatus', 'official_proposal_ready'
                 ), updated_at = now()
             WHERE id = $1::uuid`,
            [projectId, JSON.stringify(officialProposal)]
        );
        await client.query(
            `INSERT INTO project_planning_messages (
                project_id, revision, role, message_type, content, payload
             ) VALUES (
                $1::uuid, GREATEST($2::integer, 1), 'user', 'official_proposal',
                'این پاسخ به‌عنوان پروپوزال رسمی پروژه تأیید شد.',
                jsonb_build_object(
                    'sourceMessageId', $3::uuid,
                    'proposalVersion', $4::integer
                )
             )`,
            [projectId, row.current_plan_revision, messageId, officialProposal.version]
        );
        await client.query(
            `INSERT INTO events (
                project_id, entity_type, entity_id, event_type, severity,
                actor_type, actor_id, message, data
             ) VALUES (
                $1::uuid, 'planning_message', $2::text,
                'project.proposal.finalized', 'info', 'user', 'private-admin',
                'پاسخ ChatGPT به پروپوزال رسمی پروژه تبدیل شد.',
                jsonb_build_object('proposalVersion', $3::integer)
             )`,
            [projectId, messageId, officialProposal.version]
        );
        await client.query('COMMIT');
        return officialProposal;
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}


export async function saveOfficialProposalHtml(
    projectId: string,
    htmlInput: unknown
) {
    const html = typeof htmlInput === 'string' ? htmlInput.trim() : '';
    if (!html) throw new Error('PROPOSAL_HTML_REQUIRED');
    if (html.length > 500_000) throw new Error('PROPOSAL_HTML_TOO_LONG');
    if (/<script\b|\son[a-z]+\s*=|javascript:/i.test(html)) {
        throw new Error('UNSAFE_PROPOSAL_HTML');
    }
    const db = getDatabasePool();
    const result = await db.query(
        `UPDATE projects
         SET settings = jsonb_set(
                COALESCE(settings, '{}'::jsonb),
                '{officialProposal,proposalHtml}',
                to_jsonb($2::text),
                false
             ), updated_at = now()
         WHERE id = $1::uuid
           AND deleted_at IS NULL
           AND settings ? 'officialProposal'
         RETURNING settings->'officialProposal' AS official_proposal`,
        [projectId, html]
    );
    if (result.rowCount !== 1) throw new Error('OFFICIAL_PROPOSAL_NOT_FOUND');
    await db.query(
        `INSERT INTO events (
            project_id, entity_type, entity_id, event_type, severity,
            actor_type, actor_id, message, data
         ) VALUES (
            $1::uuid, 'project', $1::text, 'proposal.html.updated', 'info',
            'user', 'private-admin', 'HTML پروپوزال رسمی ویرایش شد.',
            jsonb_build_object('length', $2::integer)
         )`,
        [projectId, html.length]
    );
    return result.rows[0].official_proposal;
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

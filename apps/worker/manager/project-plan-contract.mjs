function objectValue(
    value,
    name
) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error(`INVALID_${name.toUpperCase()}`);
    }
    return value;
}


function requiredText(
    value,
    name
) {
    if (typeof value !== 'string' || !value.trim()) {
        throw new Error(`INVALID_${name.toUpperCase()}`);
    }
    return value.trim();
}


function listOfText(
    value,
    name,
    minimum = 1
) {
    if (!Array.isArray(value) || value.length < minimum) {
        throw new Error(`INVALID_${name.toUpperCase()}`);
    }
    return value.map((item, index) =>
        requiredText(item, `${name}_${index + 1}`)
    );
}


export function validateProjectPlanEnvelope(
    envelope
) {
    const plan = objectValue(envelope.plan, 'project_plan');

    if (plan.schemaVersion !== 'stagepilot.project-plan.v1') {
        throw new Error('UNSUPPORTED_PROJECT_PLAN_SCHEMA');
    }

    requiredText(plan.projectName, 'project_name');
    requiredText(plan.summary, 'project_summary');

    if (!Array.isArray(plan.stages) || plan.stages.length === 0) {
        throw new Error('PROJECT_PLAN_REQUIRES_STAGES');
    }

    const stageIds = new Set();
    const workIds = new Set();
    const dependencies = new Map();

    for (const rawStage of plan.stages) {
        const stage = objectValue(rawStage, 'stage');
        const stageId = requiredText(stage.id, 'stage_id');
        if (stageIds.has(stageId)) {
            throw new Error(`DUPLICATE_STAGE_ID:${stageId}`);
        }
        stageIds.add(stageId);
        requiredText(stage.title, 'stage_title');
        requiredText(stage.objective, 'stage_objective');
        listOfText(stage.acceptanceCriteria, 'stage_acceptance_criteria');

        if (!Array.isArray(stage.works) || stage.works.length === 0) {
            throw new Error(`STAGE_REQUIRES_WORKS:${stageId}`);
        }

        for (const rawWork of stage.works) {
            const work = objectValue(rawWork, 'work');
            const workId = requiredText(work.id, 'work_id');
            if (workIds.has(workId)) {
                throw new Error(`DUPLICATE_WORK_ID:${workId}`);
            }
            workIds.add(workId);
            requiredText(work.title, 'work_title');
            requiredText(work.objective, 'work_objective');
            listOfText(work.acceptanceCriteria, 'work_acceptance_criteria');
            const dependsOn = Array.isArray(work.dependsOn)
                ? listOfText(work.dependsOn, 'work_dependencies', 0)
                : [];
            dependencies.set(workId, dependsOn);
        }
    }

    for (const [workId, dependsOn] of dependencies) {
        for (const dependency of dependsOn) {
            if (!workIds.has(dependency)) {
                throw new Error(`UNKNOWN_WORK_DEPENDENCY:${workId}->${dependency}`);
            }
            if (dependency === workId) {
                throw new Error(`SELF_WORK_DEPENDENCY:${workId}`);
            }
        }
    }

    const visiting = new Set();
    const visited = new Set();
    const visit = id => {
        if (visiting.has(id)) {
            throw new Error(`CYCLIC_WORK_DEPENDENCY:${id}`);
        }
        if (visited.has(id)) {
            return;
        }
        visiting.add(id);
        for (const dependency of dependencies.get(id) ?? []) {
            visit(dependency);
        }
        visiting.delete(id);
        visited.add(id);
    };

    for (const workId of workIds) {
        visit(workId);
    }

    return plan;
}

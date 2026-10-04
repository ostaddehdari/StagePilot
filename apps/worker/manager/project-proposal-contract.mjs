function objectValue(value, name) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error(`INVALID_${name.toUpperCase()}`);
    }
    return value;
}


function requiredText(value, name, maximum = 30000) {
    if (typeof value !== 'string' || !value.trim()) {
        throw new Error(`INVALID_${name.toUpperCase()}`);
    }
    const result = value.trim();
    if (result.length > maximum) {
        throw new Error(`${name.toUpperCase()}_TOO_LONG`);
    }
    return result;
}


function textList(value, name, minimum = 1) {
    if (!Array.isArray(value) || value.length < minimum) {
        throw new Error(`INVALID_${name.toUpperCase()}`);
    }
    return value.map((item, index) =>
        requiredText(item, `${name}_${index + 1}`, 5000)
    );
}


export function validateProjectProposalEnvelope(envelope) {
    const proposal = objectValue(envelope.proposal, 'project_proposal');

    if (proposal.schemaVersion !== 'stagepilot.project-proposal.v1') {
        throw new Error('UNSUPPORTED_PROJECT_PROPOSAL_SCHEMA');
    }

    requiredText(proposal.title, 'proposal_title', 300);
    requiredText(proposal.executiveSummary, 'proposal_executive_summary');
    requiredText(proposal.problemStatement, 'proposal_problem_statement');
    textList(proposal.objectives, 'proposal_objectives');
    textList(proposal.targetUsers, 'proposal_target_users');

    const scope = objectValue(proposal.scope, 'proposal_scope');
    textList(scope.inScope, 'proposal_in_scope');
    textList(scope.outOfScope, 'proposal_out_of_scope', 0);

    if (!Array.isArray(proposal.functionalRequirements)
        || proposal.functionalRequirements.length === 0) {
        throw new Error('PROPOSAL_FUNCTIONAL_REQUIREMENTS_REQUIRED');
    }

    for (const [index, raw] of proposal.functionalRequirements.entries()) {
        const requirement = objectValue(raw, `functional_requirement_${index + 1}`);
        requiredText(requirement.id, `functional_requirement_${index + 1}_id`, 40);
        requiredText(requirement.title, `functional_requirement_${index + 1}_title`, 300);
        requiredText(requirement.description, `functional_requirement_${index + 1}_description`, 5000);
        textList(
            requirement.acceptanceCriteria,
            `functional_requirement_${index + 1}_acceptance_criteria`
        );
    }

    const architecture = objectValue(proposal.architecture, 'proposal_architecture');
    requiredText(architecture.overview, 'proposal_architecture_overview');
    textList(architecture.components, 'proposal_architecture_components');

    const quality = objectValue(proposal.qualityStrategy, 'proposal_quality_strategy');
    textList(quality.testLevels, 'proposal_test_levels');
    textList(quality.stageExitPolicy, 'proposal_stage_exit_policy');

    const delivery = objectValue(proposal.delivery, 'proposal_delivery');
    textList(delivery.assumptions, 'proposal_assumptions', 0);
    textList(delivery.constraints, 'proposal_constraints', 0);
    textList(delivery.risks, 'proposal_risks', 0);

    requiredText(envelope.proposalMarkdown, 'proposal_markdown');

    return proposal;
}

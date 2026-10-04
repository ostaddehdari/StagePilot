export type PlanningWorkspace = {
    project: {
        id: string;
        name: string;
        slug: string;
        description: string | null;
        status: string;
        settings: Record<string, unknown>;
        current_plan_revision: number;
    };
    messages: Array<{
        id: string;
        revision: number;
        role: 'user' | 'assistant' | 'system';
        message_type: string;
        content: string;
        payload: Record<string, unknown>;
        created_at: string;
    }>;
    plans: Array<{
        id: string;
        version: number;
        status: string;
        title: string;
        summary: string;
        proposal_json: Record<string, unknown>;
        proposal_html: string;
        created_by: string;
        approved_at: string | null;
        created_at: string;
    }>;
    promptRequests: Array<{
        id: string;
        request_key: string;
        request_type: string;
        status: string;
        last_error: string | null;
        context_json: Record<string, unknown>;
        send_attempts: number;
        claimed_at: string | null;
        sent_at: string | null;
        claimed_by: string | null;
        next_attempt_at: string | null;
        created_at: string;
        completed_at: string | null;
    }>;
    officialProposal: null | {
        version: number;
        status: string;
        title: string;
        summary: string;
        proposal: Record<string, unknown>;
        proposalMarkdown: string;
        proposalHtml: string;
        sourceMessageId: string;
        finalizedAt: string;
    };
};


function apiBase() {
    return process.env.STAGEPILOT_INTERNAL_API ?? 'http://127.0.0.1:19101';
}


function internalKey() {
    const key = process.env.STAGEPILOT_INTERNAL_KEY;
    if (!key) {
        throw new Error('STAGEPILOT_INTERNAL_KEY missing');
    }
    return key;
}


async function requestJson(
    path: string,
    init?: RequestInit
) {
    const response = await fetch(
        `${apiBase()}${path}`,
        {
            ...init,
            headers: {
                'x-stagepilot-internal-key': internalKey(),
                ...(init?.headers ?? {})
            },
            cache: 'no-store',
            signal: AbortSignal.timeout(20_000)
        }
    );
    const body = await response.json();
    if (!response.ok) {
        throw new Error(body?.message ?? `PLANNING_API_FAILED_${response.status}`);
    }
    return body;
}


export async function loadPlanningWorkspace(
    projectId: string
): Promise<PlanningWorkspace | null> {
    const response = await fetch(
        `${apiBase()}/projects/${encodeURIComponent(projectId)}/planning`,
        {
            headers: { 'x-stagepilot-internal-key': internalKey() },
            cache: 'no-store',
            signal: AbortSignal.timeout(10_000)
        }
    );
    if (response.status === 404) {
        return null;
    }
    const body = await response.json();
    if (!response.ok) {
        throw new Error(body?.message ?? 'PLANNING_LOAD_FAILED');
    }
    return body.planning;
}


export async function addPlanningMessageRequest(
    projectId: string,
    content: string
) {
    return requestJson(
        `/projects/${encodeURIComponent(projectId)}/planning/messages`,
        {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                role: 'user',
                messageType: 'comment',
                content
            })
        }
    );
}


export async function requestPlanningEvaluationRequest(
    projectId: string,
    workflow: 'proposal' | 'plan_tree' = 'proposal'
) {
    return requestJson(
        `/projects/${encodeURIComponent(projectId)}/planning/evaluate`,
        {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ workflow })
        }
    );
}


export async function deletePlanningMessageRequest(
    projectId: string,
    messageId: string
) {
    return requestJson(
        `/projects/${encodeURIComponent(projectId)}/planning/messages/${encodeURIComponent(messageId)}`,
        { method: 'DELETE' }
    );
}


export async function finalizeOfficialProposalRequest(
    projectId: string,
    messageId: string
) {
    return requestJson(
        `/projects/${encodeURIComponent(projectId)}/planning/official-proposal`,
        {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ messageId })
        }
    );
}


export async function importProjectPlanRequest(
    projectId: string,
    rawJson: string
) {
    return requestJson(
        `/projects/${encodeURIComponent(projectId)}/planning/plans`,
        {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ rawJson, createdBy: 'import' })
        }
    );
}


export async function approveProjectPlanRequest(
    projectId: string,
    version: number,
    repositoryName: string
) {
    return requestJson(
        `/projects/${encodeURIComponent(projectId)}/planning/plans/${version}/approve`,
        {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ repositoryName })
        }
    );
}

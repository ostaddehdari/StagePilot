export type ProjectAutomation = {
    state: null | {
        project_id: string;
        status: string;
        mode: string;
        cycle_no: number;
        max_work_attempts: number;
        last_error: string | null;
        last_heartbeat_at: string | null;
        started_at: string | null;
        completed_at: string | null;
        updated_at: string;
    };
    attempts: Array<{
        id: string;
        attempt: number;
        status: string;
        run_key: string;
        commit_sha: string | null;
        error_text: string | null;
        stage_key: string | null;
        work_key: string | null;
        work_title: string | null;
        started_at: string;
        completed_at: string | null;
    }>;
    worker: null | {
        worker_key: string;
        worker_version: string;
        status: string;
        current_job: Record<string, unknown>;
        last_error: string | null;
        heartbeat_at: string;
    };
    requests: Array<{
        id: string;
        request_key: string;
        request_type: string;
        status: string;
        context_json: Record<string, unknown>;
        last_error: string | null;
        sent_at: string | null;
        completed_at: string | null;
        created_at: string;
        stage_id: string | null;
        stage_key: string | null;
        stage_title: string | null;
        work_id: string | null;
        work_key: string | null;
        work_title: string | null;
        attempt_id: string | null;
        attempt: number | null;
        attempt_status: string | null;
    }>;
};

function apiBase() {
    return process.env.STAGEPILOT_INTERNAL_API ?? 'http://127.0.0.1:19101';
}

function internalKey() {
    const key = process.env.STAGEPILOT_INTERNAL_KEY;
    if (!key) throw new Error('STAGEPILOT_INTERNAL_KEY missing');
    return key;
}

export async function loadProjectAutomation(projectId: string): Promise<ProjectAutomation> {
    const response = await fetch(`${apiBase()}/projects/${encodeURIComponent(projectId)}/automation`, {
        headers: { 'x-stagepilot-internal-key': internalKey() },
        cache: 'no-store',
        signal: AbortSignal.timeout(10_000)
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body?.message ?? 'AUTOMATION_LOAD_FAILED');
    return body.automation;
}

export async function controlProjectAutomationRequest(projectId: string, action: string) {
    const response = await fetch(`${apiBase()}/projects/${encodeURIComponent(projectId)}/automation/control`, {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            'x-stagepilot-internal-key': internalKey()
        },
        body: JSON.stringify({ action }),
        cache: 'no-store',
        signal: AbortSignal.timeout(15_000)
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body?.message ?? 'AUTOMATION_CONTROL_FAILED');
    return body.state;
}

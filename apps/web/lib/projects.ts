export type ProjectListItem = {

    id: string;

    slug: string;

    name: string;

    description: string | null;

    status: string;

    settings?: Record<string, unknown>;

    current_plan_revision: number;

    stage_count: number;

    work_count: number;

    completed_work_count: number;

    progress_percent: number;

    created_at: string;

    updated_at: string;

};


export type ProjectDetail = {

    project: ProjectListItem & {

        settings?: Record<
            string,
            unknown
        >;

    };

    revision: {

        id: string;

        revision: number;

        source: string;

        request_text: string | null;

        plan_json: Record<
            string,
            unknown
        >;

        approved: boolean;

        approved_at: string | null;

        created_at: string;

    } | null;

};


function apiBase(): string {

    return (
        process.env
            .STAGEPILOT_INTERNAL_API
        ??
        'http://127.0.0.1:19101'
    );

}


function internalKey(): string {

    const key =
        process.env
            .STAGEPILOT_INTERNAL_KEY;


    if (!key) {

        throw new Error(
            'STAGEPILOT_INTERNAL_KEY missing'
        );

    }


    return key;

}


export async function loadProjects():
    Promise<ProjectListItem[]> {

    const response =
        await fetch(
            `${apiBase()}/projects`,
            {

                cache:
                    'no-store',

                headers: {

                    'x-stagepilot-internal-key':
                        internalKey()

                },

                signal:
                    AbortSignal.timeout(
                        5000
                    )

            }
        );


    if (!response.ok) {

        throw new Error(
            `Projects API failed: ${response.status}`
        );

    }


    const body =
        await response.json();


    return body.projects;

}


export async function loadProject(
    id: string
): Promise<ProjectDetail | null> {

    const response =
        await fetch(
            `${apiBase()}/projects/${encodeURIComponent(id)}`,
            {

                cache:
                    'no-store',

                headers: {

                    'x-stagepilot-internal-key':
                        internalKey()

                },

                signal:
                    AbortSignal.timeout(
                        5000
                    )

            }
        );


    if (
        response.status === 404
    ) {

        return null;

    }


    if (!response.ok) {

        throw new Error(
            `Project API failed: ${response.status}`
        );

    }


    const body =
        await response.json();


    return {

        project:
            body.project,

        revision:
            body.revision

    };

}


export async function createProjectRequest(
    payload: {

        name: string;

        slug: string;

        description: string;

        requestText: string;

    }
) {

    const response =
        await fetch(
            `${apiBase()}/projects`,
            {

                method:
                    'POST',

                headers: {

                    'content-type':
                        'application/json',

                    'x-stagepilot-internal-key':
                        internalKey()

                },

                body:
                    JSON.stringify(
                        payload
                    ),

                cache:
                    'no-store',

                signal:
                    AbortSignal.timeout(
                        10000
                    )

            }
        );


    const body =
        await response.json();


    if (!response.ok) {

        throw new Error(
            body?.message
            ??
            'PROJECT_CREATE_FAILED'
        );

    }


    return body.project as ProjectListItem;

}


async function projectMutation(
    path: string,
    init: RequestInit
) {
    const response = await fetch(
        `${apiBase()}${path}`,
        {
            ...init,
            headers: {
                'x-stagepilot-internal-key': internalKey(),
                ...(init.headers ?? {})
            },
            cache: 'no-store',
            signal: AbortSignal.timeout(15_000)
        }
    );
    const body = await response.json();
    if (!response.ok) {
        throw new Error(body?.message ?? `PROJECT_API_FAILED_${response.status}`);
    }
    return body;
}


export async function updateProjectRequest(
    id: string,
    payload: {
        name: string;
        slug: string;
        description: string;
        status: string;
        repositoryName: string;
        chatMode: string;
    }
) {
    const body = await projectMutation(
        `/projects/${encodeURIComponent(id)}`,
        {
            method: 'PATCH',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(payload)
        }
    );
    return body.project;
}


export async function deleteProjectRequest(
    id: string
) {
    return projectMutation(
        `/projects/${encodeURIComponent(id)}`,
        { method: 'DELETE' }
    );
}


export type WorkspaceSubwork = {

    id: string;

    work_id: string;

    subwork_key: string;

    title: string;

    description: string | null;

    position: number;

    kind: string;

    status: string;

    created_at: string;

    updated_at: string;

};


export type WorkspaceWork = {

    id: string;

    stage_id: string;

    work_key: string;

    title: string;

    description: string | null;

    position: number;

    weight: number;

    status: string;

    acceptance_criteria:
        unknown[];

    dependencies:
        unknown[];

    started_at:
        string | null;

    completed_at:
        string | null;

    subworks:
        WorkspaceSubwork[];

};


export type WorkspaceStage = {

    id: string;

    stage_key: string;

    title: string;

    description: string | null;

    position: number;

    weight: number;

    status: string;

    acceptance_criteria:
        unknown[];

    started_at:
        string | null;

    completed_at:
        string | null;

    works:
        WorkspaceWork[];

};


export type WorkspaceRevision = {

    id: string;

    revision: number;

    source: string;

    request_text: string | null;

    plan_json:
        Record<
            string,
            unknown
        >;

    approved: boolean;

    approved_at:
        string | null;

    created_at: string;

};


export type WorkspaceEvent = {

    id: number | string;

    event_type: string;

    severity: string;

    actor_type: string;

    actor_id: string | null;

    message: string | null;

    data:
        Record<
            string,
            unknown
        >;

    created_at: string;

};


export type ProjectWorkspace = {

    currentRevision: number;

    verifiedProgress: number;

    totals: {

        stages: number;

        works: number;

        completedWorks: number;

        subworks: number;

        revisions: number;

        events: number;

    };

    stages:
        WorkspaceStage[];

    revisions:
        WorkspaceRevision[];

    events:
        WorkspaceEvent[];

};


export async function loadProjectWorkspace(
    id: string
): Promise<ProjectWorkspace | null> {

    const response =
        await fetch(
            `${apiBase()}/projects/${encodeURIComponent(id)}/workspace`,
            {

                cache:
                    'no-store',

                headers: {

                    'x-stagepilot-internal-key':
                        internalKey()

                },

                signal:
                    AbortSignal.timeout(
                        5000
                    )

            }
        );


    if (
        response.status
        ===
        404
    ) {

        return null;

    }


    if (!response.ok) {

        throw new Error(
            `Project Workspace API failed: ${response.status}`
        );

    }


    const body =
        await response.json();


    return body.workspace;

}

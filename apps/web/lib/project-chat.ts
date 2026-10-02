export type ProjectChatConversation = {

    id: string;

    project_id: string;

    chat_account_id: string;

    external_url:
        string | null;

    external_chat_id:
        string | null;

    status: string;

    sequence_no: number;

    started_reason:
        string | null;

    metadata:
        Record<
            string,
            unknown
        >;

    created_at: string;

    closed_at:
        string | null;

    chat_account_label?:
        string | null;

};


export type ProjectChatRegistry = {

    project: {

        id: string;

        name: string;

        slug: string;

        selected_chat_account_id:
            string | null;

        selected_chat_account_label:
            string | null;

        selected_chat_account_status:
            string | null;

        selected_chat_profile_key:
            string | null;

    };

    activeConversation:
        ProjectChatConversation
        |
        null;

    conversations:
        ProjectChatConversation[];

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


async function requestJson(
    path: string,
    init?: RequestInit
) {

    const response =
        await fetch(
            `${apiBase()}${path}`,
            {

                ...init,

                headers: {

                    'x-stagepilot-internal-key':
                        internalKey(),

                    ...(init?.headers ?? {})

                },

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
            `API_FAILED_${response.status}`
        );

    }


    return body;

}


export async function loadProjectChatRegistry(
    projectId: string
): Promise<ProjectChatRegistry> {

    const body =
        await requestJson(
            `/projects/${encodeURIComponent(projectId)}/chat-registry`
        );


    return body.registry;

}


export async function selectProjectChatAccountRequest(
    projectId: string,
    chatAccountId: string
) {

    return requestJson(
        `/projects/${encodeURIComponent(projectId)}/chat-account`,
        {

            method:
                'PATCH',

            headers: {

                'content-type':
                    'application/json'

            },

            body:
                JSON.stringify({

                    chatAccountId

                })

        }
    );

}


export async function registerProjectConversationRequest(
    projectId: string,
    payload: {

        mode: 'existing' | 'new';

        externalUrl?: string;

        externalChatId?: string;

        startedReason?: string;

    }
) {

    return requestJson(
        `/projects/${encodeURIComponent(projectId)}/conversations`,
        {

            method:
                'POST',

            headers: {

                'content-type':
                    'application/json'

            },

            body:
                JSON.stringify(
                    payload
                )

        }
    );

}

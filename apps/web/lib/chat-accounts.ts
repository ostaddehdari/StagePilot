export type ChatAccountListItem = {

    id: string;

    label: string;

    profile_key: string;

    status: string;

    metadata:
        Record<
            string,
            unknown
        >;

    created_at: string;

    updated_at: string;

    session_status:
        string | null;

    browser_mode:
        string | null;

    profile_path:
        string | null;

    conversation_count:
        number;

    selected_project_count:
        number;

};


export type ChatAccountDetail = {

    account:
        ChatAccountListItem;

    sessions:
        Array<{

            id: string;

            status: string;

            browser_mode: string;

            profile_path: string | null;

            last_checked_at:
                string | null;

            metadata:
                Record<
                    string,
                    unknown
                >;

            created_at: string;

            updated_at: string;

        }>;

    conversations:
        Array<{

            id: string;

            project_id: string;

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

        }>;

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


export async function loadChatAccounts():
    Promise<ChatAccountListItem[]> {

    const response =
        await fetch(
            `${apiBase()}/chat-accounts`,
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
            `Chat Accounts API failed: ${response.status}`
        );

    }


    const body =
        await response.json();


    return body.accounts;

}


export async function loadChatAccount(
    id: string
): Promise<ChatAccountDetail | null> {

    const response =
        await fetch(
            `${apiBase()}/chat-accounts/${encodeURIComponent(id)}`,
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
            `Chat Account API failed: ${response.status}`
        );

    }


    const body =
        await response.json();


    return {

        account:
            body.account,

        sessions:
            body.sessions,

        conversations:
            body.conversations

    };

}


export async function createChatAccountRequest(
    payload: {

        label: string;

        note: string;

    }
): Promise<ChatAccountListItem> {

    const response =
        await fetch(
            `${apiBase()}/chat-accounts`,
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
            'CHAT_ACCOUNT_CREATE_FAILED'
        );

    }


    return body.account;

}


async function accountMutation(
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
        throw new Error(body?.message ?? `CHAT_ACCOUNT_API_FAILED_${response.status}`);
    }
    return body;
}


export async function updateChatAccountRequest(
    id: string,
    payload: {
        label: string;
        note: string;
    }
) {
    const body = await accountMutation(
        `/chat-accounts/${encodeURIComponent(id)}`,
        {
            method: 'PATCH',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(payload)
        }
    );
    return body.account;
}


export async function deleteChatAccountRequest(
    id: string
) {
    return accountMutation(
        `/chat-accounts/${encodeURIComponent(id)}`,
        { method: 'DELETE' }
    );
}


export type ChatAccountBrowserLogin = {

    status: string;

    accountId: string;

    profileKey: string;

    viewerUrl:
        string | null;

    viewerExpiresAt?:
        string;

    runtime:
        Record<
            string,
            unknown
        >
        |
        null;

};


async function browserLoginRequest(
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
                        45000
                    )

            }
        );


    const body =
        await response.json();


    if (!response.ok) {

        throw new Error(
            body?.message
            ??
            `BROWSER_LOGIN_API_${response.status}`
        );

    }


    return body.browserLogin;

}


export async function loadChatAccountBrowserLogin(
    accountId: string
): Promise<ChatAccountBrowserLogin> {

    return browserLoginRequest(
        `/chat-accounts/${encodeURIComponent(accountId)}/browser-login`
    );

}


export async function startChatAccountBrowserLogin(
    accountId: string,
    targetUrl?: string
): Promise<ChatAccountBrowserLogin> {

    return browserLoginRequest(
        `/chat-accounts/${encodeURIComponent(accountId)}/browser-login/start`,
        {
            method:
                'POST',

            headers: {

                'content-type':
                    'application/json'

            },

            body:
                JSON.stringify({
                    targetUrl:
                        targetUrl
                        ||
                        undefined
                })
        }
    );

}


export async function stopChatAccountBrowserLogin(
    accountId: string
): Promise<ChatAccountBrowserLogin> {

    return browserLoginRequest(
        `/chat-accounts/${encodeURIComponent(accountId)}/browser-login/stop`,
        {
            method:
                'POST',

            headers: {

                'content-type':
                    'application/json'

            },

            body:
                '{}'
        }
    );

}


export type ChatAccountBrowserRuntime = {

    status: string;

    mode: string;

    authState: string;

    validation:
        Record<
            string,
            unknown
        >
        |
        null;

    accountId: string;

    profileKey: string;

    runtime:
        Record<
            string,
            unknown
        >
        |
        null;

    transitioned?:
        boolean;

};


export async function loadChatAccountBrowserRuntime(
    accountId: string
): Promise<ChatAccountBrowserRuntime> {

    const response =
        await fetch(
            `${apiBase()}/chat-accounts/${encodeURIComponent(accountId)}/browser-runtime`,
            {
                cache:
                    'no-store',

                headers: {
                    'x-stagepilot-internal-key':
                        internalKey()
                },

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
            'BROWSER_RUNTIME_STATUS_FAILED'
        );

    }


    return body.browserRuntime;

}


export async function completeChatAccountBrowserLogin(
    accountId: string
): Promise<ChatAccountBrowserRuntime> {

    const response =
        await fetch(
            `${apiBase()}/chat-accounts/${encodeURIComponent(accountId)}/browser-login/complete`,
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
                    '{}',

                cache:
                    'no-store',

                signal:
                    AbortSignal.timeout(
                        90000
                    )
            }
        );


    const body =
        await response.json();


    if (!response.ok) {

        throw new Error(
            body?.message
            ??
            'BROWSER_LOGIN_COMPLETE_FAILED'
        );

    }


    return body.browserRuntime;

}


export async function stopChatAccountHeadless(
    accountId: string
): Promise<ChatAccountBrowserRuntime> {

    const response =
        await fetch(
            `${apiBase()}/chat-accounts/${encodeURIComponent(accountId)}/headless/stop`,
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
                    '{}',

                cache:
                    'no-store',

                signal:
                    AbortSignal.timeout(
                        45000
                    )
            }
        );


    const body =
        await response.json();


    if (!response.ok) {

        throw new Error(
            body?.message
            ??
            'HEADLESS_STOP_FAILED'
        );

    }


    return body.browserRuntime;

}

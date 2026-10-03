export type SiteSettings = {
    githubOwner: string;
    githubUsername: string;
    defaultRepository: string;
    defaultVisibility: 'private' | 'public';
    tokenConfigured: boolean;
    passwordConfigured: boolean;
    updatedAt: string | null;
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


export async function loadSiteSettings(): Promise<SiteSettings> {
    const response = await fetch(
        `${apiBase()}/settings`,
        {
            headers: { 'x-stagepilot-internal-key': internalKey() },
            cache: 'no-store',
            signal: AbortSignal.timeout(10_000)
        }
    );
    const body = await response.json();
    if (!response.ok) {
        throw new Error(body?.message ?? 'SETTINGS_LOAD_FAILED');
    }
    return body.settings;
}


export async function updateSiteSettingsRequest(
    payload: {
        githubOwner: string;
        githubUsername: string;
        githubToken: string;
        githubPassword: string;
        defaultRepository: string;
        defaultVisibility: string;
    }
) {
    const response = await fetch(
        `${apiBase()}/settings`,
        {
            method: 'PATCH',
            headers: {
                'content-type': 'application/json',
                'x-stagepilot-internal-key': internalKey()
            },
            body: JSON.stringify(payload),
            cache: 'no-store',
            signal: AbortSignal.timeout(20_000)
        }
    );
    const body = await response.json();
    if (!response.ok) {
        throw new Error(body?.message ?? 'SETTINGS_UPDATE_FAILED');
    }
    return body.settings;
}

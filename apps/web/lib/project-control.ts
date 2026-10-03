import { loadProjectAutomation } from './automation';
import { loadChatAccounts } from './chat-accounts';
import { loadPlanningWorkspace } from './planning';
import { loadProjectChatRegistry } from './project-chat';
import { loadProject, loadProjectWorkspace } from './projects';
import { loadSiteSettings } from './site-settings';


function apiBase() {
    return process.env.STAGEPILOT_INTERNAL_API ?? 'http://127.0.0.1:19101';
}


function internalKey() {
    const key = process.env.STAGEPILOT_INTERNAL_KEY;
    if (!key) throw new Error('STAGEPILOT_INTERNAL_KEY missing');
    return key;
}


export async function internalProjectRequest(path: string, init?: RequestInit) {
    const response = await fetch(`${apiBase()}${path}`, {
        ...init,
        headers: {
            'x-stagepilot-internal-key': internalKey(),
            ...(init?.headers ?? {})
        },
        cache: 'no-store',
        signal: AbortSignal.timeout(20_000)
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(body?.message ?? `PROJECT_CONTROL_FAILED_${response.status}`);
    }
    return body;
}


export async function loadProjectControlCenter(projectId: string) {
    const [detail, workspace, planning, automation, registry, accounts, siteSettings] = await Promise.all([
        loadProject(projectId),
        loadProjectWorkspace(projectId),
        loadPlanningWorkspace(projectId),
        loadProjectAutomation(projectId),
        loadProjectChatRegistry(projectId),
        loadChatAccounts(),
        loadSiteSettings()
    ]);
    if (!detail || !workspace || !planning) return null;
    return {
        project: detail.project,
        revision: detail.revision,
        workspace,
        planning,
        automation,
        registry,
        accounts,
        siteSettings,
        generatedAt: new Date().toISOString()
    };
}

import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

import { SESSION_COOKIE, verifySessionToken } from '../../../../../lib/auth';
import { controlProjectAutomationRequest } from '../../../../../lib/automation';
import {
    completeChatAccountBrowserLogin,
    startChatAccountBrowserLogin,
    stopChatAccountHeadless
} from '../../../../../lib/chat-accounts';
import { selectProjectChatAccountRequest, registerProjectConversationRequest } from '../../../../../lib/project-chat';
import {
    addPlanningMessageRequest,
    approveProjectPlanRequest,
    requestPlanningEvaluationRequest
} from '../../../../../lib/planning';
import {
    internalProjectRequest,
    loadProjectControlCenter
} from '../../../../../lib/project-control';


export const runtime = 'nodejs';


async function authorized() {
    const cookieStore = await cookies();
    return verifySessionToken(cookieStore.get(SESSION_COOKIE)?.value);
}


function sameOrigin(request: NextRequest) {
    const origin = request.headers.get('origin');
    const configured = process.env.STAGEPILOT_PUBLIC_ORIGIN;
    if (!origin || !configured) return false;
    try {
        return new URL(origin).origin === new URL(configured).origin;
    } catch {
        return false;
    }
}


export async function GET(
    _request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    if (!await authorized()) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
    const { id } = await context.params;
    const control = await loadProjectControlCenter(id);
    if (!control) return NextResponse.json({ error: 'PROJECT_NOT_FOUND' }, { status: 404 });
    return NextResponse.json({ ok: true, control }, { headers: { 'cache-control': 'no-store' } });
}


export async function POST(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    if (!await authorized()) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
    if (!sameOrigin(request)) return NextResponse.json({ error: 'INVALID_ORIGIN' }, { status: 403 });
    const { id } = await context.params;
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const action = typeof body.action === 'string' ? body.action : '';

    try {
        let result: unknown;
        switch (action) {
            case 'save-settings': {
                const settingsPayload = (body.payload ?? {}) as Record<string, unknown>;
                result = await internalProjectRequest(`/projects/${encodeURIComponent(id)}/integrations`, {
                    method: 'PATCH',
                    headers: { 'content-type': 'application/json' },
                    body: JSON.stringify(settingsPayload)
                });
                if (body.chatAccountId) {
                    await selectProjectChatAccountRequest(id, String(body.chatAccountId));
                }
                if (settingsPayload.chatProjectUrl) {
                    await registerProjectConversationRequest(id, {
                        mode: 'existing',
                        externalUrl: String(settingsPayload.chatProjectUrl),
                        startedReason: settingsPayload.chatTargetType === 'project'
                            ? 'chatgpt_project_registered'
                            : 'existing_chat_registered'
                    });
                }
                break;
            }
            case 'new-conversation': {
                if (body.chatAccountId) {
                    await selectProjectChatAccountRequest(id, String(body.chatAccountId));
                }
                const conversation = await registerProjectConversationRequest(id, {
                    mode: 'new',
                    startedReason: String(body.startedReason ?? 'project_control_center')
                });
                result = {
                    conversation,
                    request: await requestPlanningEvaluationRequest(id)
                };
                break;
            }
            case 'existing-conversation':
                result = await registerProjectConversationRequest(id, {
                    mode: 'existing',
                    externalUrl: String(body.externalUrl ?? ''),
                    startedReason: 'project_control_center'
                });
                break;
            case 'planning-comment':
                result = {
                    message: await addPlanningMessageRequest(id, String(body.content ?? '')),
                    request: await requestPlanningEvaluationRequest(id)
                };
                break;
            case 'planning-evaluate':
                result = await requestPlanningEvaluationRequest(id);
                break;
            case 'plan-approve':
                result = await approveProjectPlanRequest(id, Number(body.version), String(body.repositoryName ?? ''));
                break;
            case 'proposal-html':
                result = await internalProjectRequest(
                    `/projects/${encodeURIComponent(id)}/planning/plans/${Number(body.version)}/html`,
                    {
                        method: 'PATCH',
                        headers: { 'content-type': 'application/json' },
                        body: JSON.stringify({ html: body.html })
                    }
                );
                break;
            case 'tree-create':
                result = await internalProjectRequest(`/projects/${encodeURIComponent(id)}/tree/nodes`, {
                    method: 'POST',
                    headers: { 'content-type': 'application/json' },
                    body: JSON.stringify(body.payload ?? {})
                });
                break;
            case 'tree-update':
                result = await internalProjectRequest(
                    `/projects/${encodeURIComponent(id)}/tree/nodes/${encodeURIComponent(String(body.nodeId ?? ''))}`,
                    {
                        method: 'PATCH',
                        headers: { 'content-type': 'application/json' },
                        body: JSON.stringify(body.payload ?? {})
                    }
                );
                break;
            case 'tree-delete':
                result = await internalProjectRequest(
                    `/projects/${encodeURIComponent(id)}/tree/nodes/${encodeURIComponent(String(body.nodeId ?? ''))}`,
                    {
                        method: 'DELETE',
                        headers: { 'content-type': 'application/json' },
                        body: JSON.stringify({ kind: body.kind })
                    }
                );
                break;
            case 'tree-reorder':
                result = await internalProjectRequest(`/projects/${encodeURIComponent(id)}/tree/reorder`, {
                    method: 'POST',
                    headers: { 'content-type': 'application/json' },
                    body: JSON.stringify(body.payload ?? {})
                });
                break;
            case 'inspect-node':
                result = await internalProjectRequest(
                    `/projects/${encodeURIComponent(id)}/tree/${encodeURIComponent(String(body.kind ?? ''))}/${encodeURIComponent(String(body.nodeId ?? ''))}/inspector`
                );
                break;
            case 'automation':
                result = await controlProjectAutomationRequest(id, String(body.command ?? ''));
                break;
            case 'browser-monitor-start': {
                const accountId = String(body.accountId ?? '');
                const targetUrl = String(body.targetUrl ?? '') || undefined;
                await stopChatAccountHeadless(accountId).catch(() => null);
                result = await startChatAccountBrowserLogin(accountId, targetUrl);
                await internalProjectRequest(`/projects/${encodeURIComponent(id)}/diagnostic-events`, {
                    method: 'POST',
                    headers: { 'content-type': 'application/json' },
                    body: JSON.stringify({
                        eventType: 'browser.monitor.started',
                        message: 'مانیتور زنده noVNC برای مشاهده چرخه ChatGPT فعال شد.',
                        data: { accountId, targetUrl: targetUrl ?? null }
                    })
                });
                break;
            }
            case 'browser-monitor-stop': {
                const accountId = String(body.accountId ?? '');
                const browserRuntime = await completeChatAccountBrowserLogin(accountId);
                const requestResult = browserRuntime.transitioned === true
                    ? await requestPlanningEvaluationRequest(id)
                    : null;
                result = { browserRuntime, request: requestResult };
                await internalProjectRequest(`/projects/${encodeURIComponent(id)}/diagnostic-events`, {
                    method: 'POST',
                    headers: { 'content-type': 'application/json' },
                    body: JSON.stringify({
                        eventType: 'browser.monitor.completed',
                        message: 'مانیتور زنده بسته و وضعیت ورود ChatGPT بررسی شد.',
                        data: {
                            accountId,
                            transitioned: browserRuntime.transitioned ?? false,
                            authState: browserRuntime.authState ?? null,
                            promptRequestId: requestResult?.promptRequest?.id ?? null
                        }
                    })
                });
                break;
            }
            default:
                return NextResponse.json({ error: 'UNKNOWN_ACTION' }, { status: 400 });
        }
        return NextResponse.json({ ok: true, result });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'PROJECT_CONTROL_FAILED';
        console.error(`[project-control:${id}:${action}]`, message);
        await internalProjectRequest(`/projects/${encodeURIComponent(id)}/diagnostic-events`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                eventType: 'project.control.failed',
                severity: 'error',
                message: `عملیات ${action || 'unknown'} انجام نشد: ${message}`,
                data: { action, error: message }
            })
        }).catch(() => null);
        return NextResponse.json({ error: message }, { status: 400 });
    }
}

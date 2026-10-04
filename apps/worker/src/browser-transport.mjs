import { execFile } from 'node:child_process';
import { connect } from 'node:net';
import { mkdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { setTimeout as sleep } from 'node:timers/promises';

const execFileAsync = promisify(execFile);
const HERE = dirname(fileURLToPath(import.meta.url));
const HEADLESS_MANAGER = join(HERE, '..', 'browser', 'headless-session.mjs');
const VISIBLE_MANAGER = join(HERE, '..', 'browser', 'login-session.mjs');
const ADAPTER_ROOT = process.env.STAGEPILOT_BROWSER_ADAPTER_ROOT
    ?? '/opt/stagepilot/runtime/browser-adapter';
const RESPONSE_ROOT = process.env.STAGEPILOT_BROWSER_RESPONSE_ROOT
    ?? '/opt/stagepilot/runtime/browser-responses';
const SESSION_ROOT = process.env.STAGEPILOT_BROWSER_SESSION_ROOT
    ?? '/opt/stagepilot/runtime/browser-sessions';

function pidAlive(pid) {
    const value = Number(pid);
    if (!Number.isInteger(value) || value <= 0) return false;
    try {
        process.kill(value, 0);
        return true;
    } catch (error) {
        return error?.code === 'EPERM';
    }
}

async function readVisibleRuntime(profileKey) {
    try {
        return JSON.parse(
            await readFile(join(SESSION_ROOT, `${profileKey}.json`), 'utf8')
        );
    } catch (error) {
        if (error?.code === 'ENOENT') return null;
        const wrapped = new Error('VISIBLE_BROWSER_STATE_UNREADABLE');
        wrapped.cause = error;
        throw wrapped;
    }
}

export function visibleRuntimeIntervention(visible, controllerAlive) {
    if (
        visible?.status !== 'ready'
        || visible?.mode !== 'visible-login'
        || controllerAlive !== true
    ) {
        return null;
    }
    return {
        interventionRequired: true,
        reason: 'visible_browser_active',
        profileKey: visible.profileKey ?? null,
        accountId: visible.accountId ?? null,
        mode: 'visible-login',
        noVncPort: visible.noVncPort ?? null,
        localNoVncUrl: visible.localNoVncUrl ?? null,
        startedAt: visible.startedAt ?? null
    };
}

function parseLastJson(stdout) {
    const text = String(stdout ?? '').trim();
    if (!text) return null;
    return JSON.parse(text);
}

async function manager(command, profileKey, accountId = '', targetUrl = '') {
    const args = [HEADLESS_MANAGER, command, profileKey];
    if (command === 'start') args.push(accountId, targetUrl || 'https://chatgpt.com/');
    const result = await execFileAsync(process.execPath, args, {
        env: process.env,
        timeout: command === 'start' ? 100_000 : 20_000,
        maxBuffer: 2 * 1024 * 1024
    });
    return parseLastJson(result.stdout);
}

async function visibleManager(command, profileKey, accountId = '', targetUrl = '') {
    const args = [VISIBLE_MANAGER, command, profileKey];
    if (command === 'start') args.push(accountId, targetUrl || 'https://chatgpt.com/');
    const result = await execFileAsync(process.execPath, args, {
        env: process.env,
        timeout: command === 'start' ? 100_000 : 20_000,
        maxBuffer: 2 * 1024 * 1024
    });
    return parseLastJson(result.stdout);
}

export async function ensureBrowserRuntime({ profileKey, accountId, targetUrl }) {
    const visible = await readVisibleRuntime(profileKey);
    const intervention = visibleRuntimeIntervention(
        visible,
        pidAlive(visible?.controllerPid)
    );
    if (intervention) {
        const error = new Error('CHATGPT_INTERVENTION_REQUIRED:VISIBLE_BROWSER_ACTIVE');
        error.diagnostic = intervention;
        throw error;
    }

    let state = await manager('status', profileKey).catch(() => null);
    if (!(state?.running === true || state?.status === 'ready')) {
        state = await manager('start', profileKey, accountId, targetUrl);
    }
    if (['challenge', 'needs_login'].includes(String(state?.authState ?? ''))) {
        await manager('stop', profileKey).catch(() => null);
        const visible = await visibleManager(
            'start',
            profileKey,
            accountId,
            state?.currentUrl ?? targetUrl ?? 'https://chatgpt.com/'
        ).catch(() => null);
        const error = new Error(`CHATGPT_INTERVENTION_REQUIRED:${state.authState}`);
        error.diagnostic = {
            interventionRequired: true,
            reason: state.authState,
            profileKey,
            visibleRuntimeStarted: visible?.status === 'ready',
            noVncPort: visible?.noVncPort ?? null,
            currentUrl: state?.currentUrl ?? targetUrl ?? null,
            validation: state?.validation ?? null
        };
        throw error;
    }
    return state;
}

async function adapterRequestOnce(profileKey, request, timeoutMs) {
    const socketPath = join(ADAPTER_ROOT, `${profileKey}.sock`);
    return await new Promise((resolve, reject) => {
        const socket = connect(socketPath);
        let buffer = '';
        const timer = setTimeout(() => {
            socket.destroy();
            reject(new Error('ADAPTER_RESPONSE_TIMEOUT'));
        }, timeoutMs);
        socket.setEncoding('utf8');
        socket.once('connect', () => socket.write(`${JSON.stringify(request)}\n`));
        socket.on('data', chunk => { buffer += chunk; });
        socket.once('error', error => {
            clearTimeout(timer);
            reject(error);
        });
        socket.once('end', () => {
            clearTimeout(timer);
            try {
                const result = JSON.parse(buffer.trim());
                if (result?.ok !== true) {
                    const error = new Error(result?.error ?? 'ADAPTER_REQUEST_FAILED');
                    error.diagnostic = result?.diagnostic ?? null;
                    reject(error);
                    return;
                }
                resolve(result);
            } catch (error) {
                reject(error);
            }
        });
    });
}

export async function adapterRequest(profileKey, request, timeoutMs = 190_000) {
    const readinessDeadline = Date.now() + 20_000;
    while (true) {
        try {
            return await adapterRequestOnce(profileKey, request, timeoutMs);
        } catch (error) {
            if (
                !['ENOENT', 'ECONNREFUSED'].includes(String(error?.code ?? ''))
                || Date.now() >= readinessDeadline
            ) {
                throw error;
            }
            await sleep(250);
        }
    }
}

export async function sendPromptAndWait({
    profileKey,
    accountId,
    conversationUrl,
    createProjectName,
    operationId,
    promptText,
    timeoutMs = 180_000,
    onProgress
}) {
    const progress = async (stage, details = {}) => {
        if (typeof onProgress === 'function') {
            await onProgress({ stage, at: new Date().toISOString(), ...details });
        }
    };

    await progress('browser_starting');
    const runtime = await ensureBrowserRuntime({
        profileKey,
        accountId,
        targetUrl: conversationUrl || 'https://chatgpt.com/'
    });
    await progress('browser_ready', { mode: runtime?.mode ?? 'headless' });

    if (conversationUrl) {
        const target = new URL(conversationUrl);
        if (target.hostname === 'www.chatgpt.com') target.hostname = 'chatgpt.com';
        const isConversation = /\/c\/[^/?#]+/.test(target.pathname);
        await progress('target_opening', {
            targetType: isConversation ? 'conversation' : 'project',
            targetHost: target.hostname,
            targetPath: target.pathname
        });
        await adapterRequest(profileKey, {
            action: isConversation ? 'open-conversation' : 'open-target',
            url: target.href
        });
        await progress('target_opened', { targetType: isConversation ? 'conversation' : 'project' });
    } else if (createProjectName) {
        await progress('project_creating');
        await adapterRequest(profileKey, {
            action: 'new-project',
            name: createProjectName
        });
        await progress('project_created');
    } else {
        await progress('new_chat_opening');
        await adapterRequest(profileKey, { action: 'new-chat' });
        await progress('new_chat_opened');
    }

    await progress('composer_drafting');
    await adapterRequest(profileKey, {
        action: 'draft',
        operationId,
        text: promptText
    });
    await progress('composer_ready');
    await progress('send_clicking');
    const sent = await adapterRequest(profileKey, {
        action: 'commit-send',
        operationId
    });
    if (sent?.state?.state !== 'SENT_CONFIRMED') {
        throw new Error(`CHATGPT_SEND_NOT_CONFIRMED:${sent?.state?.state ?? 'unknown'}`);
    }
    await progress('send_confirmed', {
        conversationId: sent.state.conversationId ?? null,
        conversationUrl: sent.state.conversationUrl ?? null
    });

    await mkdir(RESPONSE_ROOT, { recursive: true, mode: 0o700 });
    const responseStatePath = join(RESPONSE_ROOT, `${operationId}.json`);
    await progress('response_waiting', { timeoutMs });
    const waited = await adapterRequest(profileKey, {
        action: 'wait-response',
        operationId,
        expectedPromptText: promptText,
        provisionalConversationId: sent.state.conversationId,
        responseStatePath,
        timeoutMs
    }, timeoutMs + 15_000);

    if (waited?.response?.state !== 'RESPONSE_COMPLETED') {
        throw new Error(`CHATGPT_RESPONSE_NOT_COMPLETE:${waited?.response?.state ?? 'unknown'}`);
    }
    await progress('response_received', {
        responseSha256: waited.response.responseSha256 ?? null,
        conversationUrl: waited.response.observedUrl ?? sent.state.conversationUrl ?? null
    });

    return {
        text: waited.response.responseText,
        sha256: waited.response.responseSha256,
        conversationId: waited.response.observedConversationId ?? sent.state.conversationId,
        conversationUrl: waited.response.observedUrl ?? sent.state.conversationUrl,
        responseStatePath
    };
}

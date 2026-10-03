import { execFile } from 'node:child_process';
import { connect } from 'node:net';
import { mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const HERE = dirname(fileURLToPath(import.meta.url));
const HEADLESS_MANAGER = join(HERE, '..', 'browser', 'headless-session.mjs');
const ADAPTER_ROOT = process.env.STAGEPILOT_BROWSER_ADAPTER_ROOT
    ?? '/opt/stagepilot/runtime/browser-adapter';
const RESPONSE_ROOT = process.env.STAGEPILOT_BROWSER_RESPONSE_ROOT
    ?? '/opt/stagepilot/runtime/browser-responses';

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

export async function ensureBrowserRuntime({ profileKey, accountId, targetUrl }) {
    let state = await manager('status', profileKey).catch(() => null);
    if (state?.running === true || state?.status === 'ready') return state;
    state = await manager('start', profileKey, accountId, targetUrl);
    return state;
}

export async function adapterRequest(profileKey, request, timeoutMs = 190_000) {
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
                    reject(new Error(result?.error ?? 'ADAPTER_REQUEST_FAILED'));
                    return;
                }
                resolve(result);
            } catch (error) {
                reject(error);
            }
        });
    });
}

export async function sendPromptAndWait({
    profileKey,
    accountId,
    conversationUrl,
    operationId,
    promptText,
    timeoutMs = 180_000
}) {
    await ensureBrowserRuntime({
        profileKey,
        accountId,
        targetUrl: conversationUrl || 'https://chatgpt.com/'
    });

    if (conversationUrl) {
        await adapterRequest(profileKey, {
            action: 'open-conversation',
            url: conversationUrl
        });
    } else {
        await adapterRequest(profileKey, { action: 'new-chat' });
    }

    await adapterRequest(profileKey, {
        action: 'draft',
        operationId,
        text: promptText
    });
    const sent = await adapterRequest(profileKey, {
        action: 'commit-send',
        operationId
    });
    if (sent?.state?.state !== 'SENT_CONFIRMED') {
        throw new Error(`CHATGPT_SEND_NOT_CONFIRMED:${sent?.state?.state ?? 'unknown'}`);
    }

    await mkdir(RESPONSE_ROOT, { recursive: true, mode: 0o700 });
    const responseStatePath = join(RESPONSE_ROOT, `${operationId}.json`);
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

    return {
        text: waited.response.responseText,
        sha256: waited.response.responseSha256,
        conversationId: waited.response.observedConversationId ?? sent.state.conversationId,
        conversationUrl: waited.response.observedUrl ?? sent.state.conversationUrl,
        responseStatePath
    };
}

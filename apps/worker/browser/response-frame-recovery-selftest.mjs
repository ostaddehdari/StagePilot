import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
    isTransientFrameError,
    waitForCorrelatedResponse
} from './chatgpt-response-monitor.mjs';


assert.equal(
    isTransientFrameError(new Error("Attempted to use detached Frame 'ABC'.")),
    true
);
assert.equal(isTransientFrameError(new Error('ordinary failure')), false);

const root = await mkdtemp(join(tmpdir(), 'stagepilot-frame-recovery-'));
const statePath = join(root, 'response.json');
let evaluations = 0;
const page = {
    async evaluate() {
        evaluations += 1;
        if (evaluations <= 2) {
            throw new Error("Attempted to use detached Frame 'TEST'.");
        }
        return {
            url: 'https://chatgpt.com/c/test-conversation',
            title: 'ChatGPT',
            units: [
                {
                    key: 'turn:0:user', role: 'user', text: 'PROMPT',
                    searchMessageIds: 'user-1', conversationId: 'test-conversation', messageId: 'user-1'
                },
                {
                    key: 'turn:2:assistant', role: 'assistant', text: '{"responseType":"project_proposal"}',
                    searchMessageIds: 'assistant-1', conversationId: 'test-conversation', messageId: 'assistant-1'
                }
            ],
            streaming: false,
            streamingEvidence: []
        };
    }
};

try {
    const result = await waitForCorrelatedResponse({
        page,
        operationId: 'project_proposal:test',
        expectedPromptText: 'PROMPT',
        provisionalConversationId: 'test-conversation',
        responseStatePath: statePath,
        timeoutMs: 10_000
    });
    assert.equal(result.state, 'RESPONSE_COMPLETED');
    assert.equal(result.responseText, '{"responseType":"project_proposal"}');
    assert.ok(evaluations >= 5);
    const persisted = JSON.parse(await readFile(statePath, 'utf8'));
    assert.equal(persisted.state, 'RESPONSE_COMPLETED');
    process.stdout.write(JSON.stringify({
        ok: true,
        suite: 'response-frame-recovery',
        detachedFrameRetries: 2,
        responseRecovered: true,
        duplicateSendAttempted: false
    }) + '\n');
} finally {
    await rm(root, { recursive: true, force: true });
}

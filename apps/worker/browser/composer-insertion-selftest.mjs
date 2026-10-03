import assert from 'node:assert/strict';

import {
    readFile
} from 'node:fs/promises';

import {
    fileURLToPath
} from 'node:url';

import {
    replaceComposerTextAtomically
} from './chatgpt-adapter.mjs';


const prompt = [
    'STAGEPILOT_PROJECT_DISCOVERY_V2',
    'TASK:',
    '1. Evaluate the idea.',
    '2. Return exactly one JSON object.'
].join('\n');


const calls = [];

const handle = {
    async focus() {
        calls.push(['focus']);
    }
};

const page = {
    async evaluate(_callback, receivedHandle) {
        assert.equal(receivedHandle, handle);
        calls.push(['select']);
    },
    keyboard: {
        async press(key) {
            calls.push(['press', key]);
        },
        async insertText(text) {
            calls.push(['insertText', text]);
        },
        async type() {
            throw new Error('keyboard.type must never be called for a prompt');
        }
    }
};


await replaceComposerTextAtomically({
    page,
    handle,
    text: prompt
});


assert.deepEqual(
    calls,
    [
        ['focus'],
        ['select'],
        ['press', 'Backspace'],
        ['insertText', prompt]
    ]
);


const adapterSource = await readFile(
    fileURLToPath(
        new URL('./chatgpt-adapter.mjs', import.meta.url)
    ),
    'utf8'
);


assert.doesNotMatch(
    adapterSource,
    /keyboard\s*\.\s*type\s*\(\s*text\b/
);


assert.match(
    adapterSource,
    /DRAFT_TRIGGERED_UNEXPECTED_SEND/
);


assert.match(
    adapterSource,
    /userMessageCountBeforeDraft/
);


process.stdout.write(
    `${JSON.stringify({
        ok: true,
        suite: 'composer-insertion',
        multilineCharacters: prompt.length,
        insertOperations: calls.filter(call => call[0] === 'insertText').length,
        enterKeyEvents: calls.filter(call => call[1] === 'Enter').length
    })}\n`
);

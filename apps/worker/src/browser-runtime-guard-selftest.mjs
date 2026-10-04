import assert from 'node:assert/strict';

import {
    readFile
} from 'node:fs/promises';

import {
    fileURLToPath
} from 'node:url';

import {
    visibleRuntimeIntervention
} from './browser-transport.mjs';


const readyVisible = {
    status: 'ready',
    mode: 'visible-login',
    profileKey: 'chat-account-test',
    accountId: 'account-test',
    controllerPid: 12345,
    noVncPort: 16080,
    localNoVncUrl: 'http://127.0.0.1:16080/vnc.html',
    startedAt: '2026-10-04T00:00:00.000Z'
};


const active = visibleRuntimeIntervention(
    readyVisible,
    true
);


assert.deepEqual(
    active,
    {
        interventionRequired: true,
        reason: 'visible_browser_active',
        profileKey: 'chat-account-test',
        accountId: 'account-test',
        mode: 'visible-login',
        noVncPort: 16080,
        localNoVncUrl: 'http://127.0.0.1:16080/vnc.html',
        startedAt: '2026-10-04T00:00:00.000Z'
    }
);


assert.equal(
    visibleRuntimeIntervention(
        readyVisible,
        false
    ),
    null
);


assert.equal(
    visibleRuntimeIntervention(
        {
            ...readyVisible,
            status: 'stopped'
        },
        true
    ),
    null
);


assert.equal(
    visibleRuntimeIntervention(
        {
            ...readyVisible,
            mode: 'background-headful'
        },
        true
    ),
    null
);


const source = await readFile(
    fileURLToPath(
        new URL('./browser-transport.mjs', import.meta.url)
    ),
    'utf8'
);


assert.match(
    source,
    /const visible = await readVisibleRuntime\(profileKey\)/
);


assert.match(
    source,
    /throw error;\s*}\s*\n\s*let state = await manager/
);


process.stdout.write(
    `${JSON.stringify({
        ok: true,
        suite: 'browser-runtime-guard',
        visibleRuntimeBlocked: true,
        headlessStartAttempted: false,
        noVncPortPreserved: active.noVncPort
    })}\n`
);

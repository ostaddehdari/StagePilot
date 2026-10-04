import assert from 'node:assert/strict';

import {
    readFile
} from 'node:fs/promises';

import {
    fileURLToPath
} from 'node:url';

import {
    visibleRuntimeActivity
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


const active = visibleRuntimeActivity(
    readyVisible,
    true
);


assert.deepEqual(
    active,
    {
        active: true,
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
    visibleRuntimeActivity(
        readyVisible,
        false
    ),
    null
);


assert.equal(
    visibleRuntimeActivity(
        {
            ...readyVisible,
            status: 'stopped'
        },
        true
    ),
    null
);


assert.equal(
    visibleRuntimeActivity(
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
    /await visibleManager\('stop', profileKey\)/
);


assert.doesNotMatch(
    source,
    /new Error\('CHATGPT_INTERVENTION_REQUIRED:VISIBLE_BROWSER_ACTIVE'\)/
);


assert.match(
    source,
    /visibleHandoff:\s*\{\s*completed: true/
);


process.stdout.write(
    `${JSON.stringify({
        ok: true,
        suite: 'browser-runtime-guard',
        visibleRuntimeDetected: true,
        automaticHandoffEnabled: true,
        falseInterventionRemoved: true,
        noVncPortPreserved: active.noVncPort
    })}\n`
);

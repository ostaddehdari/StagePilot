import {
    rm
} from 'node:fs/promises';

import {
    sha256
} from './execution-policy.mjs';

import {
    executeApprovedScript
} from './safe-runner.mjs';


const failures = [];


function check(
    name,
    condition
) {

    if (condition) {

        console.log(
            `${name}: PASS`
        );

    } else {

        failures.push(
            name
        );

        console.log(
            `${name}: FAIL`
        );

    }

}


const workspace =
    '/opt/stagepilot/runtime/runner/workspaces/stop-on-failure-selftest';


await rm(
    workspace,
    {
        recursive:
            true,
        force:
            true
    }
);


const failingContent =
    '#!/usr/bin/env bash\n'
    +
    'set -Eeuo pipefail\n'
    +
    'echo EXPECTED_FAILURE >&2\n'
    +
    'exit 17\n';


const first = {

    status:
        'approved',

    position:
        1,

    filename:
        '01-fail.sh',

    content:
        failingContent,

    sha256:
        sha256(
            failingContent
        ),

    dependsOn:
        []

};


const firstResult =
    await executeApprovedScript({

        batchStatus:
            'approved',

        script:
            first,

        completedPositions:
            [],

        workspace:
            `${workspace}/first`,

        timeoutMs:
            10000

    });


check(
    'failure-script-executed',
    firstResult.executed === true
);


check(
    'failure-exit-code',
    firstResult.exitCode === 17
);


check(
    'failure-not-success',
    firstResult.exitCode !== 0
);


const secondContent =
    '#!/usr/bin/env bash\n'
    +
    'set -Eeuo pipefail\n'
    +
    'echo SHOULD_NOT_RUN\n';


const second = {

    status:
        'approved',

    position:
        2,

    filename:
        '02-dependent.sh',

    content:
        secondContent,

    sha256:
        sha256(
            secondContent
        ),

    dependsOn:
        [1]

};


const secondResult =
    await executeApprovedScript({

        batchStatus:
            'approved',

        script:
            second,

        /*
         * Position 1 failed, therefore it MUST NOT
         * enter completedPositions.
         */
        completedPositions:
            [],

        workspace:
            `${workspace}/second`,

        timeoutMs:
            10000

    });


check(
    'dependent-not-executed',
    secondResult.executed === false
);


check(
    'dependent-blocked',
    secondResult.blocked === true
);


check(
    'dependency-failure-reason',
    secondResult.reason === 'dependency-not-completed:1'
);


await rm(
    workspace,
    {
        recursive:
            true,
        force:
            true
    }
);


if (failures.length > 0) {

    console.error(
        `STOP_SELFTEST_FAILURES=${failures.join(',')}`
    );

    process.exit(
        1
    );

}


console.log(
    'STOP_ON_FAILURE_SELFTEST=PASS'
);

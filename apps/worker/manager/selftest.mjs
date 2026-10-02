import {
    assertValidResponseEnvelope,
    validateResponseEnvelope
} from './response-contract.mjs';


import {
    buildManagerPrompt,
    PROMPT_TYPES
} from './prompt-contract.mjs';


import {
    decideManagerAction
} from './manager-policy.mjs';


const failures = [];


function check(
    name,
    value
) {

    if (!value) {

        failures.push(
            name
        );

        console.log(
            `${name}: FAIL`
        );

    } else {

        console.log(
            `${name}: PASS`
        );

    }

}


const scriptBatch = {

    responseType:
        'script_batch',

    summary:
        'test',

    scripts: [
        {
            order:
                1,

            name:
                'run.sh',

            language:
                'bash',

            content:
                'echo ok',

            dependsOn:
                []
        }
    ]

};


check(
    'valid-script-batch',
    validateResponseEnvelope(
        scriptBatch
    ).ok
);


check(
    'valid-report-only',
    validateResponseEnvelope({

        responseType:
            'report_only',

        summary:
            'report',

        scripts:
            []

    }).ok
);


check(
    'valid-decision-required',
    validateResponseEnvelope({

        responseType:
            'decision_required',

        summary:
            'decision',

        decision: {
            question:
                'Continue?',

            options: [
                'yes',
                'no'
            ]
        },

        scripts:
            []

    }).ok
);


check(
    'reject-empty-script-batch',
    !validateResponseEnvelope({

        responseType:
            'script_batch',

        summary:
            'bad',

        scripts:
            []

    }).ok
);


assertValidResponseEnvelope(
    scriptBatch
);


const prompt =
    buildManagerPrompt({

        type:
            PROMPT_TYPES.WORK_EXECUTION,

        projectName:
            'StagePilot',

        objective:
            'Self-test deterministic prompt',

        stage:
            'S05',

        work:
            'W01',

        verifiedState:
            'Stage 4 PASS'

    });


check(
    'prompt-has-protocol',
    prompt.text.includes(
        'STAGEPILOT_MANAGER_PROTOCOL_V1'
    )
);


check(
    'prompt-has-response-contract',
    prompt.text.includes(
        'RESPONSE_CONTRACT'
    )
);


check(
    'prompt-has-sha256',
    /^[a-f0-9]{64}$/
        .test(
            prompt.sha256
        )
);


const managerCases = [

    {
        name:
            'wait-response',

        state: {
            promptRequestStatus:
                'waiting_response'
        },

        expected:
            'WAIT_RESPONSE'
    },

    {
        name:
            'extract-scripts',

        state: {
            responseType:
                'script_batch',

            scriptsExtracted:
                false
        },

        expected:
            'EXTRACT_SCRIPTS'
    },

    {
        name:
            'decision',

        state: {
            responseType:
                'decision_required'
        },

        expected:
            'REQUIRE_DECISION'
    },

    {
        name:
            'run-script',

        state: {
            pendingScriptCount:
                2
        },

        expected:
            'RUN_NEXT_SCRIPT'
    },

    {
        name:
            'diagnose-failure',

        state: {
            failedRun:
                true
        },

        expected:
            'DIAGNOSE_FAILURE'
    },

    {
        name:
            'test-gate',

        state: {
            requiresTests:
                true,

            testsPassed:
                false
        },

        expected:
            'RUN_TESTS'
    },

    {
        name:
            'git-gate',

        state: {
            requiresTests:
                false,

            requiresGit:
                true,

            gitVerified:
                false
        },

        expected:
            'VERIFY_GIT'
    },

    {
        name:
            'complete-work',

        state: {
            workReady:
                true
        },

        expected:
            'COMPLETE_WORK'
    }

];


for (
    const test
    of managerCases
) {

    const decision =
        decideManagerAction(
            test.state
        );


    check(
        `manager-${test.name}`,
        decision.action
        ===
        test.expected
    );

}


if (
    failures.length > 0
) {

    console.error(
        `SELFTEST_FAILURES=${failures.join(',')}`
    );

    process.exit(
        1
    );

}


console.log(
    'MANAGER_SELFTEST=PASS'
);

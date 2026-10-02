import {
    evaluateCompletionGate
} from './completion-gate.mjs';


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


const good =
    evaluateCompletionGate({

        prerequisitesPassed:
            true,

        requiredTestsPassed:
            true,

        batchCompleted:
            true,

        realFailedExecutions:
            0,

        activeRuns:
            0,

        browserStateUnchanged:
            true,

        gitVerified:
            true

    });


check(
    'complete-stage',
    good.ready === true
    &&
    good.action === 'COMPLETE_STAGE'
);


const failedTest =
    evaluateCompletionGate({

        prerequisitesPassed:
            true,

        requiredTestsPassed:
            false,

        batchCompleted:
            true,

        realFailedExecutions:
            0,

        activeRuns:
            0,

        browserStateUnchanged:
            true,

        gitVerified:
            true

    });


check(
    'block-failed-tests',
    failedTest.ready === false
    &&
    failedTest.blockers.includes(
        'required-tests-not-passed'
    )
);


const missingGit =
    evaluateCompletionGate({

        prerequisitesPassed:
            true,

        requiredTestsPassed:
            true,

        batchCompleted:
            true,

        realFailedExecutions:
            0,

        activeRuns:
            0,

        browserStateUnchanged:
            true,

        gitVerified:
            false

    });


check(
    'block-missing-git',
    missingGit.ready === false
    &&
    missingGit.blockers.includes(
        'git-not-verified'
    )
);


const failedRun =
    evaluateCompletionGate({

        prerequisitesPassed:
            true,

        requiredTestsPassed:
            true,

        batchCompleted:
            true,

        realFailedExecutions:
            1,

        activeRuns:
            0,

        browserStateUnchanged:
            true,

        gitVerified:
            true

    });


check(
    'block-real-execution-failure',
    failedRun.ready === false
    &&
    failedRun.blockers.includes(
        'real-execution-failures'
    )
);


if (
    failures.length > 0
) {

    console.error(
        `COMPLETION_GATE_FAILURES=${failures.join(',')}`
    );

    process.exit(
        1
    );

}


console.log(
    'COMPLETION_GATE_SELFTEST=PASS'
);

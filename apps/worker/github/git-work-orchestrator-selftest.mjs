import {
    ensureSameCommitOnRetry,
    verifyDestinationSha
} from './git-work-lifecycle.mjs';


const failures = [];


function check(
    name,
    condition
) {

    if (
        condition
    ) {

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


check(
    'same-commit-retry',

    ensureSameCommitOnRetry({
        storedLocalCommitSha:
            'abc',

        currentLocalCommitSha:
            'abc'
    })
    ===
    true
);


let changedRejected =
    false;


try {

    ensureSameCommitOnRetry({
        storedLocalCommitSha:
            'abc',

        currentLocalCommitSha:
            'def'
    });

} catch {

    changedRejected =
        true;

}


check(
    'changed-commit-rejected',
    changedRejected
);


const verified =
    verifyDestinationSha({
        localCommitSha:
            'abc',

        remoteCommitSha:
            'abc'
    });


check(
    'same-sha-verifies',
    verified.verified
    ===
    true
);


const mismatch =
    verifyDestinationSha({
        localCommitSha:
            'abc',

        remoteCommitSha:
            'def'
    });


check(
    'mismatch-git-pending',
    mismatch.state
    ===
    'GIT_PENDING'
);


check(
    'mismatch-no-implementation-rerun',
    mismatch.rerunImplementation
    ===
    false
);


if (
    failures.length > 0
) {

    console.error(
        `GIT_WORK_ORCHESTRATOR_SELFTEST_FAILURES=${failures.join(',')}`
    );

    process.exit(
        1
    );

}


console.log(
    'GIT_WORK_ORCHESTRATOR_SELFTEST=PASS'
);

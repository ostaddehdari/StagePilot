import {

    stageBranchName,
    buildWorkCommitMessage,
    verifyCommitReadiness,
    decideGitLifecycleAction,
    transitionAfterCommit,
    transitionBeforePush,
    transitionAfterPushFailure,
    transitionAfterPushSuccess,
    verifyDestinationSha,
    ensureSameCommitOnRetry,
    pushFailurePolicy

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
    'stage-branch',

    stageBranchName(
        'S06'
    )
    ===
    'stage/S06'
);


const commitMessage =
    buildWorkCommitMessage({

        stageKey:
            'S06',

        workKey:
            'W05',

        runKey:
            'run-123',

        summary:
            'verify per-work Git lifecycle'

    });


check(
    'commit-message-stage',
    commitMessage.includes(
        'S06/W05'
    )
);


check(
    'commit-message-run',
    commitMessage.includes(
        '[run:run-123]'
    )
);


check(
    'commit-readiness',

    verifyCommitReadiness({

        implementationVerified:
            true,

        testsVerified:
            true,

        workspaceVerified:
            true,

        implementationRef:
            'run:123'

    })
    ===
    true
);


let testsGateRejected =
    false;


try {

    verifyCommitReadiness({

        implementationVerified:
            true,

        testsVerified:
            false,

        workspaceVerified:
            true,

        implementationRef:
            'run:123'

    });

} catch {

    testsGateRejected =
        true;

}


check(
    'failed-tests-block-commit',
    testsGateRejected
);


check(
    'ready-creates-commit',

    decideGitLifecycleAction({

        state:
            'READY_TO_COMMIT'

    }).action
    ===
    'CREATE_COMMIT'
);


const committed =
    transitionAfterCommit({

        state:
            'READY_TO_COMMIT',

        localCommitSha:
            'aaaaaaaa'

    });


check(
    'commit-transition',
    committed.state
    ===
    'COMMITTED'
);


const intent =
    transitionBeforePush({

        state:
            committed.state,

        localCommitSha:
            committed.localCommitSha

    });


check(
    'push-intent-durable-before-push',
    intent.state
    ===
    'PUSH_INTENT'
);


const pending =
    transitionAfterPushFailure({

        localCommitSha:
            'aaaaaaaa',

        reason:
            'network-failure'

    });


check(
    'push-failure-git-pending',
    pending.state
    ===
    'GIT_PENDING'
);


check(
    'push-failure-no-implementation-rerun',
    pending.error.rerunImplementation
    ===
    false
);


const pendingDecision =
    decideGitLifecycleAction({

        state:
            'GIT_PENDING',

        localCommitSha:
            'aaaaaaaa'

    });


check(
    'git-pending-retries-push-only',
    pendingDecision.action
    ===
    'RETRY_PUSH_ONLY'
);


check(
    'git-pending-does-not-rerun-implementation',
    pendingDecision.rerunImplementation
    ===
    false
);


check(
    'same-commit-on-retry',

    ensureSameCommitOnRetry({

        storedLocalCommitSha:
            'aaaaaaaa',

        currentLocalCommitSha:
            'aaaaaaaa'

    })
    ===
    true
);


let changedCommitRejected =
    false;


try {

    ensureSameCommitOnRetry({

        storedLocalCommitSha:
            'aaaaaaaa',

        currentLocalCommitSha:
            'bbbbbbbb'

    });

} catch {

    changedCommitRejected =
        true;

}


check(
    'changed-local-commit-rejected',
    changedCommitRejected
);


const pushed =
    transitionAfterPushSuccess({

        localCommitSha:
            'aaaaaaaa',

        remoteCommitSha:
            'aaaaaaaa'

    });


check(
    'push-success-state',
    pushed.state
    ===
    'PUSHED'
);


const verified =
    verifyDestinationSha({

        localCommitSha:
            'aaaaaaaa',

        remoteCommitSha:
            'aaaaaaaa'

    });


check(
    'remote-sha-match-verified',
    verified.state
    ===
    'VERIFIED'
    &&
    verified.verified
    ===
    true
);


const mismatch =
    verifyDestinationSha({

        localCommitSha:
            'aaaaaaaa',

        remoteCommitSha:
            'bbbbbbbb'

    });


check(
    'remote-sha-mismatch-git-pending',
    mismatch.state
    ===
    'GIT_PENDING'
);


check(
    'remote-mismatch-no-implementation-rerun',
    mismatch.rerunImplementation
    ===
    false
);


const failurePolicy =
    pushFailurePolicy();


check(
    'failure-policy-push-only',
    failurePolicy.retry
    ===
    'PUSH_ONLY'
);


check(
    'failure-policy-no-recommit',
    failurePolicy.recreateCommit
    ===
    false
);


check(
    'failure-policy-no-rerun',
    failurePolicy.rerunImplementation
    ===
    false
);


check(
    'failure-policy-no-force-push',
    failurePolicy.automaticForcePush
    ===
    false
);


if (
    failures.length > 0
) {

    console.error(
        `GIT_WORK_LIFECYCLE_SELFTEST_FAILURES=${failures.join(',')}`
    );

    process.exit(
        1
    );

}


console.log(
    'GIT_WORK_LIFECYCLE_SELFTEST=PASS'
);

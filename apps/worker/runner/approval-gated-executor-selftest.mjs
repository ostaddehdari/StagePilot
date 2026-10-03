import {
    isIntegrityFailure
} from './approval-gated-executor.mjs';


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
    'file-set-change-integrity-failure',

    isIntegrityFailure(
        new Error(
            'QUARANTINE_FILE_SET_CHANGED'
        )
    )
    ===
    true
);


check(
    'hash-mismatch-integrity-failure',

    isIntegrityFailure(
        new Error(
            'QUARANTINE_FILE_HASH_MISMATCH:01-run.sh'
        )
    )
    ===
    true
);


check(
    'syntax-change-integrity-failure',

    isIntegrityFailure(
        new Error(
            'QUARANTINE_FILE_SYNTAX_CHANGED:01-run.sh'
        )
    )
    ===
    true
);


check(
    'wrong-server-not-global-integrity-failure',

    isIntegrityFailure(
        new Error(
            'APPROVAL_SERVER_CHANGED'
        )
    )
    ===
    false
);


check(
    'wrong-workspace-not-global-integrity-failure',

    isIntegrityFailure(
        new Error(
            'APPROVAL_WORKSPACE_CHANGED'
        )
    )
    ===
    false
);


check(
    'inactive-approval-not-integrity-failure',

    isIntegrityFailure(
        new Error(
            'APPROVAL_NOT_ACTIVE'
        )
    )
    ===
    false
);


if (
    failures.length > 0
) {

    console.error(
        `APPROVAL_GATED_EXECUTOR_SELFTEST_FAILURES=${failures.join(',')}`
    );

    process.exit(
        1
    );

}


console.log(
    'APPROVAL_GATED_EXECUTOR_SELFTEST=PASS'
);

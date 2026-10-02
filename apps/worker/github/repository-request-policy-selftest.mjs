import {
    normalizeRepositoryRequest,
    canonicalRequestFingerprint,
    ensureIdempotentReplay,
    decideRepositoryAction,
    validateExplicitVisibility
} from './repository-request-policy.mjs';


const failures = [];


function check(
    name,
    value
) {

    if (value) {

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


const normalized =
    normalizeRepositoryRequest({
        mode:
            'create',

        owner:
            'ostaddehdari',

        repositoryName:
            'ExampleProject'
    });


check(
    'default-private',
    normalized.visibility
    ===
    'private'
);


check(
    'default-main',
    normalized.defaultBranch
    ===
    'main'
);


const requestA = {
    mode:
        'create',

    owner:
        'ostaddehdari',

    repositoryName:
        'ExampleProject',

    visibility:
        'private',

    defaultBranch:
        'main'
};


const hash1 =
    canonicalRequestFingerprint(
        requestA
    );


const hash2 =
    canonicalRequestFingerprint(
        requestA
    );


check(
    'fingerprint-deterministic',
    hash1 === hash2
);


check(
    'same-request-idempotent',
    ensureIdempotentReplay({
        storedFingerprint:
            hash1,

        incomingFingerprint:
            hash2
    }) === true
);


let keyReuseRejected =
    false;


try {

    ensureIdempotentReplay({
        storedFingerprint:
            hash1,

        incomingFingerprint:
            canonicalRequestFingerprint({
                ...requestA,

                repositoryName:
                    'DifferentProject'
            })
    });

} catch {

    keyReuseRejected =
        true;

}


check(
    'different-request-same-key-rejected',
    keyReuseRejected
);


check(
    'approval-required',
    decideRepositoryAction({
        status:
            'draft',

        approved:
            false,

        existingBinding:
            false
    }).action
    ===
    'REQUIRE_APPROVAL'
);


check(
    'approved-executes-once',
    decideRepositoryAction({
        status:
            'approved',

        approved:
            true,

        existingBinding:
            false
    }).action
    ===
    'EXECUTE_ONCE'
);


check(
    'executing-never-retries',
    decideRepositoryAction({
        status:
            'executing',

        approved:
            true,

        existingBinding:
            false
    }).action
    ===
    'RECONCILE_ONLY'
);


check(
    'uncertain-never-retries',
    decideRepositoryAction({
        status:
            'uncertain',

        approved:
            true,

        existingBinding:
            false
    }).action
    ===
    'RECONCILE_ONLY'
);


check(
    'existing-binding-returned',
    decideRepositoryAction({
        status:
            'approved',

        approved:
            true,

        existingBinding:
            true
    }).action
    ===
    'RETURN_EXISTING_BINDING'
);


check(
    'known-repository-id-reconciled',
    decideRepositoryAction({
        status:
            'approved',

        approved:
            true,

        existingBinding:
            false,

        githubRepositoryId:
            123
    }).action
    ===
    'RECONCILE_REMOTE_IDENTITY'
);


let publicRejected =
    false;


try {

    validateExplicitVisibility({
        visibility:
            'public',

        publicExplicitlyApproved:
            false
    });

} catch {

    publicRejected =
        true;

}


check(
    'public-requires-explicit-approval',
    publicRejected
);


check(
    'private-default-safe',
    validateExplicitVisibility({
        visibility:
            'private'
    }) === true
);


if (
    failures.length > 0
) {

    console.error(
        `REPOSITORY_POLICY_SELFTEST_FAILURES=${failures.join(',')}`
    );

    process.exit(
        1
    );

}


console.log(
    'REPOSITORY_REQUEST_POLICY_SELFTEST=PASS'
);

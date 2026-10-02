import {
    executionDecision,
    verifyExactRepositoryIdentity,
    verifyKnownRepositoryId,
    bindingFromIdentity
} from './repository-executor.mjs';


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


const createApproved = {
    mode:
        'create',

    owner:
        'ostaddehdari',

    repositoryName:
        'ExampleProject',

    visibility:
        'private',

    defaultBranch:
        'main',

    status:
        'approved',

    approved:
        true
};


const attachApproved = {
    ...createApproved,

    mode:
        'attach'
};


check(
    'create-approved-executes',

    executionDecision({
        request:
            createApproved
    }).action
    ===
    'EXECUTE_CREATE'
);


check(
    'attach-approved-executes',

    executionDecision({
        request:
            attachApproved
    }).action
    ===
    'EXECUTE_ATTACH'
);


check(
    'create-executing-reconciles',

    executionDecision({
        request: {
            ...createApproved,
            status:
                'executing'
        }
    }).action
    ===
    'RECONCILE_CREATE'
);


check(
    'create-uncertain-reconciles',

    executionDecision({
        request: {
            ...createApproved,
            status:
                'uncertain'
        }
    }).action
    ===
    'RECONCILE_CREATE'
);


check(
    'attach-uncertain-reconciles',

    executionDecision({
        request: {
            ...attachApproved,
            status:
                'uncertain'
        }
    }).action
    ===
    'RECONCILE_ATTACH'
);


check(
    'draft-requires-approval',

    executionDecision({
        request: {
            ...createApproved,
            status:
                'draft',
            approved:
                false
        }
    }).action
    ===
    'REQUIRE_APPROVAL'
);


check(
    'existing-binding-never-executes',

    executionDecision({
        request:
            createApproved,

        existingBinding: {
            id:
                'binding-1'
        }
    }).action
    ===
    'RETURN_EXISTING_BINDING'
);


const remote = {
    id:
        123456,

    owner: {
        login:
            'ostaddehdari'
    },

    name:
        'ExampleProject',

    full_name:
        'ostaddehdari/ExampleProject',

    html_url:
        'https://github.com/ostaddehdari/ExampleProject',

    ssh_url:
        'git@github.com:ostaddehdari/ExampleProject.git',

    private:
        true,

    visibility:
        'private',

    default_branch:
        'main'
};


const identity =
    verifyExactRepositoryIdentity(
        createApproved,
        remote
    );


check(
    'exact-identity-verified',
    identity.id === 123456
);


check(
    'known-id-matches',
    verifyKnownRepositoryId(
        123456,
        identity
    ) === true
);


let idMismatchRejected =
    false;


try {

    verifyKnownRepositoryId(
        999999,
        identity
    );

} catch {

    idMismatchRejected =
        true;

}


check(
    'repository-id-mismatch-rejected',
    idMismatchRejected
);


let ownerMismatchRejected =
    false;


try {

    verifyExactRepositoryIdentity(
        createApproved,
        {
            ...remote,

            owner: {
                login:
                    'someone-else'
            },

            full_name:
                'someone-else/ExampleProject'
        }
    );

} catch {

    ownerMismatchRejected =
        true;

}


check(
    'owner-mismatch-rejected',
    ownerMismatchRejected
);


let nameMismatchRejected =
    false;


try {

    verifyExactRepositoryIdentity(
        createApproved,
        {
            ...remote,

            name:
                'DifferentProject',

            full_name:
                'ostaddehdari/DifferentProject'
        }
    );

} catch {

    nameMismatchRejected =
        true;

}


check(
    'same-owner-different-name-rejected',
    nameMismatchRejected
);


const binding =
    bindingFromIdentity({
        request:
            createApproved,

        identity,

        bindingMode:
            'created'
    });


check(
    'binding-keeps-repository-id',
    binding.githubRepositoryId
    ===
    123456
);


check(
    'binding-mode-created',
    binding.bindingMode
    ===
    'created'
);


check(
    'binding-created-by-stagepilot',
    binding.createdByStagePilot
    ===
    true
);


let publicWithoutApprovalRejected =
    false;


try {

    executionDecision({
        request: {
            ...createApproved,

            visibility:
                'public',

            publicExplicitlyApproved:
                false
        }
    });

} catch {

    publicWithoutApprovalRejected =
        true;

}


check(
    'public-create-needs-explicit-approval',
    publicWithoutApprovalRejected
);


if (
    failures.length > 0
) {

    console.error(
        `REPOSITORY_EXECUTOR_SELFTEST_FAILURES=${failures.join(',')}`
    );

    process.exit(
        1
    );

}


console.log(
    'REPOSITORY_EXECUTOR_SELFTEST=PASS'
);

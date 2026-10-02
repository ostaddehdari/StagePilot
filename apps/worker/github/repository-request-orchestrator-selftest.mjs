import {
    rowToRepositoryRequest,
    rowToBinding,
    classifyExecutionPersistence
} from './repository-request-orchestrator.mjs';


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


const row = {
    id:
        'request-1',

    project_id:
        'project-1',

    access_profile_id:
        'profile-1',

    request_key:
        'key-1',

    mode:
        'create',

    owner_login:
        'ostaddehdari',

    repository_name:
        'ExampleRepo',

    visibility:
        'private',

    default_branch:
        'main',

    request_fingerprint:
        'abc',

    status:
        'approved',

    approved_at:
        new Date(),

    github_repository_id:
        null,

    result_json:
        {}
};


const request =
    rowToRepositoryRequest(
        row
    );


check(
    'request-row-mode',
    request.mode
    ===
    'create'
);


check(
    'request-row-approved',
    request.approved
    ===
    true
);


check(
    'request-row-owner',
    request.owner
    ===
    'ostaddehdari'
);


const binding =
    rowToBinding({
        id:
            'binding-1',

        project_id:
            'project-1',

        github_repository_id:
            123,

        owner_login:
            'ostaddehdari',

        repository_name:
            'ExampleRepo',

        full_name:
            'ostaddehdari/ExampleRepo',

        html_url:
            'https://github.com/ostaddehdari/ExampleRepo',

        ssh_url:
            'git@github.com:ostaddehdari/ExampleRepo.git',

        visibility:
            'private',

        default_branch:
            'main',

        binding_mode:
            'created',

        created_by_stagepilot:
            true,

        status:
            'ready'
    });


check(
    'binding-repository-id',
    binding.githubRepositoryId
    ===
    123
);


check(
    'created-classified-success',

    classifyExecutionPersistence({
        outcome:
            'created',

        binding: {
            githubRepositoryId:
                123
        }
    })
    ===
    'SUCCESS'
);


check(
    'attached-classified-success',

    classifyExecutionPersistence({
        outcome:
            'attached',

        binding: {
            githubRepositoryId:
                123
        }
    })
    ===
    'SUCCESS'
);


check(
    'reconciled-classified-success',

    classifyExecutionPersistence({
        outcome:
            'reconciled',

        binding: {
            githubRepositoryId:
                123
        }
    })
    ===
    'SUCCESS'
);


check(
    'uncertain-classified-uncertain',

    classifyExecutionPersistence({
        outcome:
            'create_uncertain',

        requiresReconciliation:
            true
    })
    ===
    'UNCERTAIN'
);


check(
    'reconcile-not-found-is-uncertain',

    classifyExecutionPersistence({
        outcome:
            'reconcile_not_found'
    })
    ===
    'UNCERTAIN'
);


check(
    'existing-binding-noop',

    classifyExecutionPersistence({
        outcome:
            'existing_binding'
    })
    ===
    'NOOP'
);


check(
    'permission-denied-failure',

    classifyExecutionPersistence({
        outcome:
            'permission_denied'
    })
    ===
    'FAILURE'
);


if (
    failures.length > 0
) {

    console.error(
        `ORCHESTRATOR_SELFTEST_FAILURES=${failures.join(',')}`
    );

    process.exit(
        1
    );

}


console.log(
    'REPOSITORY_ORCHESTRATOR_SELFTEST=PASS'
);

import {
    repositoryRowToPolicy,
    workspaceRowToPolicy
} from './workspace-registration.mjs';


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


const repository =
    repositoryRowToPolicy({
        id:
            'binding-1',

        project_id:
            'project-1',

        github_repository_id:
            123,

        owner_login:
            'ostaddehdari',

        repository_name:
            'ProjectOne'
    });


check(
    'repository-project-mapped',
    repository.projectId
    ===
    'project-1'
);


check(
    'repository-id-mapped',
    repository.githubRepositoryId
    ===
    123
);


const workspace =
    workspaceRowToPolicy({
        project_id:
            'project-1',

        repository_binding_id:
            'binding-1',

        workspace_path:
            '/srv/project-one',

        remote_name:
            'origin',

        remote_url:
            'git@github.com:ostaddehdari/ProjectOne.git',

        branch_name:
            'main'
    });


check(
    'workspace-project-mapped',
    workspace.projectId
    ===
    'project-1'
);


check(
    'workspace-binding-mapped',
    workspace.repositoryBindingId
    ===
    'binding-1'
);


check(
    'workspace-remote-mapped',
    workspace.remoteUrl
    ===
    'git@github.com:ostaddehdari/ProjectOne.git'
);


if (
    failures.length > 0
) {

    console.error(
        `WORKSPACE_REGISTRATION_SELFTEST_FAILURES=${failures.join(',')}`
    );

    process.exit(
        1
    );

}


console.log(
    'WORKSPACE_REGISTRATION_SELFTEST=PASS'
);

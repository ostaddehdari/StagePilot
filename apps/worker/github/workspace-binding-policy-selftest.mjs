import {
    parseGitHubRemote,
    normalizeWorkspacePath,
    guardGitMutation
} from './workspace-binding-policy.mjs';


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


const repositoryA = {
    id:
        'binding-a',

    projectId:
        'project-a',

    githubRepositoryId:
        101,

    ownerLogin:
        'ostaddehdari',

    repositoryName:
        'ProjectA'
};


const workspaceA = {
    projectId:
        'project-a',

    repositoryBindingId:
        'binding-a',

    workspacePath:
        '/srv/projects/project-a',

    remoteName:
        'origin',

    remoteUrl:
        'git@github.com:ostaddehdari/ProjectA.git',

    branchName:
        'main'
};


const valid =
    guardGitMutation({
        projectId:
            'project-a',

        repositoryBinding:
            repositoryA,

        workspaceBinding:
            workspaceA,

        actual: {
            projectId:
                'project-a',

            repositoryId:
                101,

            workspacePath:
                '/srv/projects/project-a',

            remoteUrl:
                'git@github.com:ostaddehdari/ProjectA.git',

            branchName:
                'main'
        }
    });


check(
    'valid-binding-allows-mutation',
    valid.mutationAllowed
    ===
    true
);


check(
    'verified-before-mutation',
    valid.verifiedBeforeMutation
    ===
    true
);


check(
    'ssh-remote-parsed',
    parseGitHubRemote(
        'git@github.com:ostaddehdari/ProjectA.git'
    ).fullName
    ===
    'ostaddehdari/ProjectA'
);


check(
    'https-same-repository-canonical',

    parseGitHubRemote(
        'https://github.com/ostaddehdari/ProjectA'
    ).canonical
    ===
    parseGitHubRemote(
        'git@github.com:ostaddehdari/ProjectA.git'
    ).canonical
);


check(
    'workspace-normalized',

    normalizeWorkspacePath(
        '/srv/projects/./project-a'
    )
    ===
    '/srv/projects/project-a'
);


let projectMismatchRejected =
    false;


try {

    guardGitMutation({
        projectId:
            'project-b',

        repositoryBinding:
            repositoryA,

        workspaceBinding:
            workspaceA,

        actual: {}
    });

} catch (
    error
) {

    projectMismatchRejected =
        error.message
        ===
        'REPOSITORY_PROJECT_MISMATCH';

}


check(
    'cross-project-binding-rejected',
    projectMismatchRejected
);


let remoteBRejected =
    false;


try {

    guardGitMutation({
        projectId:
            'project-a',

        repositoryBinding:
            repositoryA,

        workspaceBinding:
            workspaceA,

        actual: {
            remoteUrl:
                'git@github.com:ostaddehdari/ProjectB.git'
        }
    });

} catch (
    error
) {

    remoteBRejected =
        error.message
        ===
        'ACTUAL_REMOTE_MISMATCH';

}


check(
    'project-a-to-project-b-remote-rejected',
    remoteBRejected
);


let repositoryIdMismatchRejected =
    false;


try {

    guardGitMutation({
        projectId:
            'project-a',

        repositoryBinding:
            repositoryA,

        workspaceBinding:
            workspaceA,

        actual: {
            repositoryId:
                202
        }
    });

} catch (
    error
) {

    repositoryIdMismatchRejected =
        error.message
        ===
        'ACTUAL_REPOSITORY_ID_MISMATCH';

}


check(
    'repository-id-mismatch-rejected',
    repositoryIdMismatchRejected
);


let workspaceMismatchRejected =
    false;


try {

    guardGitMutation({
        projectId:
            'project-a',

        repositoryBinding:
            repositoryA,

        workspaceBinding:
            workspaceA,

        actual: {
            workspacePath:
                '/srv/projects/project-b'
        }
    });

} catch (
    error
) {

    workspaceMismatchRejected =
        error.message
        ===
        'ACTUAL_WORKSPACE_MISMATCH';

}


check(
    'workspace-mismatch-rejected',
    workspaceMismatchRejected
);


let branchMismatchRejected =
    false;


try {

    guardGitMutation({
        projectId:
            'project-a',

        repositoryBinding:
            repositoryA,

        workspaceBinding:
            workspaceA,

        actual: {
            branchName:
                'different-branch'
        }
    });

} catch (
    error
) {

    branchMismatchRejected =
        error.message
        ===
        'ACTUAL_BRANCH_MISMATCH';

}


check(
    'branch-mismatch-rejected',
    branchMismatchRejected
);


let malformedRemoteRejected =
    false;


try {

    parseGitHubRemote(
        'git@example.com:someone/project.git'
    );

} catch {

    malformedRemoteRejected =
        true;

}


check(
    'non-github-remote-rejected',
    malformedRemoteRejected
);


if (
    failures.length > 0
) {

    console.error(
        `WORKSPACE_BINDING_SELFTEST_FAILURES=${failures.join(',')}`
    );

    process.exit(
        1
    );

}


console.log(
    'WORKSPACE_BINDING_POLICY_SELFTEST=PASS'
);

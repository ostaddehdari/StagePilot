import {
    posix as path
} from 'node:path';


function nonEmpty(
    value,
    code
) {

    const normalized =
        String(
            value
            ??
            ''
        ).trim();


    if (!normalized) {

        throw new Error(
            code
        );

    }


    return normalized;

}


export function normalizeWorkspacePath(
    value
) {

    const input =
        nonEmpty(
            value,
            'WORKSPACE_REQUIRED'
        );


    if (
        !input.startsWith(
            '/'
        )
    ) {

        throw new Error(
            'WORKSPACE_MUST_BE_ABSOLUTE'
        );

    }


    const normalized =
        path.normalize(
            input
        );


    if (
        normalized
        ===
        '/'
    ) {

        throw new Error(
            'WORKSPACE_ROOT_NOT_ALLOWED'
        );

    }


    return normalized;

}


export function normalizeBranchName(
    value
) {

    const branch =
        nonEmpty(
            value,
            'BRANCH_REQUIRED'
        );


    if (
        /\s/.test(
            branch
        )
        ||
        branch.includes(
            '..'
        )
        ||
        branch.includes(
            '@{'
        )
        ||
        branch.startsWith(
            '/'
        )
        ||
        branch.endsWith(
            '/'
        )
    ) {

        throw new Error(
            'INVALID_BRANCH_NAME'
        );

    }


    return branch;

}


export function parseGitHubRemote(
    value
) {

    const remote =
        nonEmpty(
            value,
            'REMOTE_URL_REQUIRED'
        );


    let match =
        remote.match(
            /^git@github\.com:([A-Za-z0-9-]+)\/([A-Za-z0-9._-]+?)(?:\.git)?$/
        );


    if (!match) {

        match =
            remote.match(
                /^https:\/\/github\.com\/([A-Za-z0-9-]+)\/([A-Za-z0-9._-]+?)(?:\.git)?\/?$/
            );

    }


    if (!match) {

        throw new Error(
            'UNSUPPORTED_GITHUB_REMOTE'
        );

    }


    return {
        owner:
            match[1],

        repository:
            match[2],

        fullName:
            `${match[1]}/${match[2]}`,

        canonical:
            `github.com/${match[1].toLowerCase()}/${match[2].toLowerCase()}`
    };

}


export function verifyProjectRepositoryWorkspace({
    projectId,

    repositoryBinding,

    workspaceBinding,

    actual = {}
}) {

    const expectedProjectId =
        nonEmpty(
            projectId,
            'PROJECT_ID_REQUIRED'
        );


    if (!repositoryBinding) {

        throw new Error(
            'REPOSITORY_BINDING_REQUIRED'
        );

    }


    if (!workspaceBinding) {

        throw new Error(
            'WORKSPACE_BINDING_REQUIRED'
        );

    }


    if (
        String(
            repositoryBinding.projectId
        )
        !==
        expectedProjectId
    ) {

        throw new Error(
            'REPOSITORY_PROJECT_MISMATCH'
        );

    }


    if (
        String(
            workspaceBinding.projectId
        )
        !==
        expectedProjectId
    ) {

        throw new Error(
            'WORKSPACE_PROJECT_MISMATCH'
        );

    }


    if (
        String(
            workspaceBinding.repositoryBindingId
        )
        !==
        String(
            repositoryBinding.id
        )
    ) {

        throw new Error(
            'WORKSPACE_REPOSITORY_BINDING_MISMATCH'
        );

    }


    const expectedRemote =
        parseGitHubRemote(
            workspaceBinding.remoteUrl
        );


    const repositoryFullName =
        `${repositoryBinding.ownerLogin}/${repositoryBinding.repositoryName}`;


    if (
        expectedRemote.fullName.toLowerCase()
        !==
        repositoryFullName.toLowerCase()
    ) {

        throw new Error(
            'BOUND_REMOTE_REPOSITORY_MISMATCH'
        );

    }


    const expectedWorkspace =
        normalizeWorkspacePath(
            workspaceBinding.workspacePath
        );


    const expectedBranch =
        normalizeBranchName(
            workspaceBinding.branchName
        );


    if (
        actual.projectId !== undefined
        &&
        String(
            actual.projectId
        )
        !==
        expectedProjectId
    ) {

        throw new Error(
            'ACTUAL_PROJECT_MISMATCH'
        );

    }


    if (
        actual.repositoryId !== undefined
        &&
        String(
            actual.repositoryId
        )
        !==
        String(
            repositoryBinding.githubRepositoryId
        )
    ) {

        throw new Error(
            'ACTUAL_REPOSITORY_ID_MISMATCH'
        );

    }


    if (
        actual.remoteUrl !== undefined
    ) {

        const actualRemote =
            parseGitHubRemote(
                actual.remoteUrl
            );


        if (
            actualRemote.canonical
            !==
            expectedRemote.canonical
        ) {

            throw new Error(
                'ACTUAL_REMOTE_MISMATCH'
            );

        }

    }


    if (
        actual.workspacePath !== undefined
        &&
        normalizeWorkspacePath(
            actual.workspacePath
        )
        !==
        expectedWorkspace
    ) {

        throw new Error(
            'ACTUAL_WORKSPACE_MISMATCH'
        );

    }


    if (
        actual.branchName !== undefined
        &&
        normalizeBranchName(
            actual.branchName
        )
        !==
        expectedBranch
    ) {

        throw new Error(
            'ACTUAL_BRANCH_MISMATCH'
        );

    }


    return {
        allowed:
            true,

        projectId:
            expectedProjectId,

        repositoryBindingId:
            repositoryBinding.id,

        githubRepositoryId:
            repositoryBinding.githubRepositoryId,

        repositoryFullName,

        workspacePath:
            expectedWorkspace,

        remoteName:
            workspaceBinding.remoteName
            ??
            'origin',

        remoteUrl:
            workspaceBinding.remoteUrl,

        branchName:
            expectedBranch
    };

}


export function guardGitMutation(
    descriptor
) {

    const result =
        verifyProjectRepositoryWorkspace(
            descriptor
        );


    return {
        ...result,

        mutationAllowed:
            true,

        verifiedBeforeMutation:
            true
    };

}

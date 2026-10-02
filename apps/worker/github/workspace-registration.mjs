import {
    spawn
} from 'node:child_process';

import {
    resolve
} from 'node:path';

import {
    guardGitMutation
} from './workspace-binding-policy.mjs';


function run(
    command,
    args,
    {
        cwd
    } = {}
) {

    return new Promise(
        (
            resolvePromise,
            rejectPromise
        ) => {

            const child =
                spawn(
                    command,
                    args,
                    {
                        cwd,

                        env: {
                            PATH:
                                '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',

                            HOME:
                                '/opt/stagepilot/runtime',

                            LANG:
                                'C.UTF-8',

                            LC_ALL:
                                'C.UTF-8',

                            GIT_TERMINAL_PROMPT:
                                '0'
                        },

                        stdio: [
                            'ignore',
                            'pipe',
                            'pipe'
                        ]
                    }
                );


            let stdout = '';
            let stderr = '';


            child.stdout.on(
                'data',
                chunk => {

                    stdout +=
                        chunk.toString(
                            'utf8'
                        );

                }
            );


            child.stderr.on(
                'data',
                chunk => {

                    stderr +=
                        chunk.toString(
                            'utf8'
                        );

                }
            );


            child.once(
                'error',
                rejectPromise
            );


            child.once(
                'close',
                code => {

                    resolvePromise({
                        code:
                            Number(
                                code
                                ??
                                1
                            ),

                        stdout,

                        stderr
                    });

                }
            );

        }
    );

}


async function requiredGit(
    workspace,
    args,
    errorCode
) {

    const result =
        await run(
            '/usr/bin/git',
            [
                '-C',
                workspace,
                ...args
            ],
            {
                cwd:
                    workspace
            }
        );


    if (
        result.code
        !==
        0
    ) {

        const error =
            new Error(
                errorCode
            );


        error.gitExitCode =
            result.code;


        throw error;

    }


    return result.stdout.trim();

}


export async function inspectGitWorkspace({

    workspacePath,

    remoteName = 'origin'

}) {

    const workspace =
        resolve(
            String(
                workspacePath
            )
        );


    const root =
        await requiredGit(
            workspace,
            [
                'rev-parse',
                '--show-toplevel'
            ],
            'WORKSPACE_NOT_GIT_REPOSITORY'
        );


    if (
        resolve(
            root
        )
        !==
        workspace
    ) {

        throw new Error(
            'WORKSPACE_GIT_ROOT_MISMATCH'
        );

    }


    const remoteUrl =
        await requiredGit(
            workspace,
            [
                'remote',
                'get-url',
                remoteName
            ],
            'WORKSPACE_REMOTE_MISSING'
        );


    const branchName =
        await requiredGit(
            workspace,
            [
                'branch',
                '--show-current'
            ],
            'WORKSPACE_BRANCH_UNAVAILABLE'
        );


    if (
        !branchName
    ) {

        throw new Error(
            'WORKSPACE_DETACHED_HEAD'
        );

    }


    const headSha =
        await requiredGit(
            workspace,
            [
                'rev-parse',
                'HEAD'
            ],
            'WORKSPACE_HEAD_UNAVAILABLE'
        );


    return {
        workspacePath:
            workspace,

        remoteName,

        remoteUrl,

        branchName,

        headSha
    };

}


export async function loadRepositoryBinding(
    db,
    projectId
) {

    const result =
        await db.query(
            `
            SELECT *
            FROM github_project_repositories
            WHERE project_id=$1
            LIMIT 1
            `,
            [
                projectId
            ]
        );


    if (
        result.rowCount
        !==
        1
    ) {

        throw new Error(
            'PROJECT_REPOSITORY_BINDING_NOT_FOUND'
        );

    }


    return result.rows[0];

}


export function repositoryRowToPolicy(
    row
) {

    return {
        id:
            row.id,

        projectId:
            row.project_id,

        githubRepositoryId:
            row.github_repository_id,

        ownerLogin:
            row.owner_login,

        repositoryName:
            row.repository_name
    };

}


export function workspaceRowToPolicy(
    row
) {

    return {
        projectId:
            row.project_id,

        repositoryBindingId:
            row.repository_binding_id,

        workspacePath:
            row.workspace_path,

        remoteName:
            row.remote_name,

        remoteUrl:
            row.remote_url,

        branchName:
            row.branch_name
    };

}


export async function registerProjectWorkspace({

    db,

    projectId,

    repositoryBindingId,

    workspacePath,

    remoteName = 'origin'

}) {

    const repositoryRow =
        await loadRepositoryBinding(
            db,
            projectId
        );


    if (
        String(
            repositoryRow.id
        )
        !==
        String(
            repositoryBindingId
        )
    ) {

        throw new Error(
            'REQUESTED_REPOSITORY_BINDING_MISMATCH'
        );

    }


    const actual =
        await inspectGitWorkspace({
            workspacePath,
            remoteName
        });


    const expectedWorkspace = {
        projectId,

        repositoryBindingId:
            repositoryRow.id,

        workspacePath:
            actual.workspacePath,

        remoteName,

        remoteUrl:
            repositoryRow.ssh_url,

        branchName:
            repositoryRow.default_branch
            ??
            'main'
    };


    const verified =
        guardGitMutation({
            projectId,

            repositoryBinding:
                repositoryRowToPolicy(
                    repositoryRow
                ),

            workspaceBinding:
                expectedWorkspace,

            actual: {
                projectId,

                repositoryId:
                    repositoryRow.github_repository_id,

                workspacePath:
                    actual.workspacePath,

                remoteUrl:
                    actual.remoteUrl,

                branchName:
                    actual.branchName
            }
        });


    const result =
        await db.query(
            `
            INSERT INTO github_project_workspaces (
                project_id,
                repository_binding_id,
                workspace_path,
                remote_name,
                remote_url,
                branch_name,
                status,
                verified_head_sha,
                last_verified_at,
                metadata
            )
            VALUES (
                $1,
                $2,
                $3,
                $4,
                $5,
                $6,
                'ready',
                $7,
                now(),
                $8::jsonb
            )
            ON CONFLICT (project_id)
            DO UPDATE SET
                repository_binding_id=
                    EXCLUDED.repository_binding_id,

                workspace_path=
                    EXCLUDED.workspace_path,

                remote_name=
                    EXCLUDED.remote_name,

                remote_url=
                    EXCLUDED.remote_url,

                branch_name=
                    EXCLUDED.branch_name,

                status='ready',

                verified_head_sha=
                    EXCLUDED.verified_head_sha,

                last_verified_at=
                    now(),

                metadata=
                    EXCLUDED.metadata,

                updated_at=
                    now()

            RETURNING *
            `,
            [
                projectId,

                repositoryRow.id,

                actual.workspacePath,

                remoteName,

                actual.remoteUrl,

                actual.branchName,

                actual.headSha,

                JSON.stringify({
                    registeredBy:
                        'workspace-registration',

                    actualGitInspection:
                        true,

                    verifiedBeforePersistence:
                        true,

                    repositoryFullName:
                        `${repositoryRow.owner_login}/${repositoryRow.repository_name}`
                })
            ]
        );


    return {
        verified,
        actual,
        row:
            result.rows[0]
    };

}


export async function loadWorkspaceBinding(
    db,
    projectId
) {

    const result =
        await db.query(
            `
            SELECT *
            FROM github_project_workspaces
            WHERE project_id=$1
            LIMIT 1
            `,
            [
                projectId
            ]
        );


    if (
        result.rowCount
        !==
        1
    ) {

        throw new Error(
            'PROJECT_WORKSPACE_BINDING_NOT_FOUND'
        );

    }


    return result.rows[0];

}


export async function verifyProjectWorkspaceForMutation({

    db,

    projectId,

    workspacePath

}) {

    const repositoryRow =
        await loadRepositoryBinding(
            db,
            projectId
        );


    const workspaceRow =
        await loadWorkspaceBinding(
            db,
            projectId
        );


    const actual =
        await inspectGitWorkspace({
            workspacePath,

            remoteName:
                workspaceRow.remote_name
        });


    const verified =
        guardGitMutation({
            projectId,

            repositoryBinding:
                repositoryRowToPolicy(
                    repositoryRow
                ),

            workspaceBinding:
                workspaceRowToPolicy(
                    workspaceRow
                ),

            actual: {
                projectId,

                repositoryId:
                    repositoryRow.github_repository_id,

                workspacePath:
                    actual.workspacePath,

                remoteUrl:
                    actual.remoteUrl,

                branchName:
                    actual.branchName
            }
        });


    return {
        verified,
        actual,
        repository:
            repositoryRow,
        workspace:
            workspaceRow
    };

}


export async function guardedGitTransport({

    db,

    projectId,

    workspacePath,

    transport

}) {

    if (
        typeof transport
        !==
        'function'
    ) {

        throw new Error(
            'TRANSPORT_FUNCTION_REQUIRED'
        );

    }


    const verified =
        await verifyProjectWorkspaceForMutation({
            db,
            projectId,
            workspacePath
        });


    const result =
        await transport(
            verified
        );


    return {
        verifiedBeforeTransport:
            true,

        transportResult:
            result
    };

}

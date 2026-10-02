import {
    mkdir,
    rm,
    writeFile
} from 'node:fs/promises';

import {
    spawn
} from 'node:child_process';

import {
    Pool
} from 'pg';

import {
    createRepository,
    deleteRepository,
    getRepository
} from './github-api-client.mjs';

import {
    registerProjectWorkspace,
    verifyProjectWorkspaceForMutation,
    guardedGitTransport
} from './workspace-registration.mjs';


const owner =
    process.env.STAGEPILOT_GITHUB_OWNER;


const profileId =
    process.env.STAGEPILOT_GITHUB_PROFILE_ID;


const secretRef =
    process.env.STAGEPILOT_GITHUB_API_SECRET_REF;


const workspaceRoot =
    process.env.STAGEPILOT_WORKSPACE_ROOT;


if (
    process.env.STAGEPILOT_LIVE_GITHUB_ACCEPTANCE
    !==
    '1'
) {

    throw new Error(
        'LIVE_ACCEPTANCE_NOT_ENABLED'
    );

}


if (
    !owner
    ||
    !profileId
    ||
    !secretRef
    ||
    !workspaceRoot
) {

    throw new Error(
        'LIVE_ACCEPTANCE_CONFIG_MISSING'
    );

}


const pool =
    new Pool({
        host:
            process.env.STAGEPILOT_DB_HOST,

        port:
            Number(
                process.env.STAGEPILOT_DB_PORT
            ),

        user:
            process.env.STAGEPILOT_DB_USER,

        password:
            process.env.STAGEPILOT_DB_PASSWORD,

        database:
            process.env.STAGEPILOT_DB_NAME,

        max:
            2
    });


const db =
    await pool.connect();


const stamp =
    `${Date.now()}-${process.pid}`;


const names = {
    a:
        `stagepilot-w03-a-${stamp}`,

    b:
        `stagepilot-w03-b-${stamp}`
};


const workspaces = {
    a:
        `${workspaceRoot}/s06-w03-a-${stamp}`,

    b:
        `${workspaceRoot}/s06-w03-b-${stamp}`
};


const projectIds = [];


const report = {
    registration: {},
    guards: {},
    cleanup: {}
};


function requireCondition(
    condition,
    message
) {

    if (!condition) {

        throw new Error(
            message
        );

    }

}


function runGit(
    workspace,
    args
) {

    return new Promise(
        (
            resolvePromise,
            rejectPromise
        ) => {

            const child =
                spawn(
                    '/usr/bin/git',
                    [
                        '-C',
                        workspace,
                        ...args
                    ],
                    {
                        cwd:
                            workspace,

                        env: {
                            PATH:
                                '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',

                            HOME:
                                workspace,

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

                    if (
                        Number(
                            code
                        )
                        !==
                        0
                    ) {

                        rejectPromise(
                            new Error(
                                `GIT_COMMAND_FAILED:${args.join(' ')}:${stderr.trim()}`
                            )
                        );

                        return;

                    }


                    resolvePromise(
                        stdout.trim()
                    );

                }
            );

        }
    );

}


async function ensureRemoteAbsent(
    repositoryName
) {

    const lookup =
        await getRepository(
            secretRef,
            owner,
            repositoryName
        );


    requireCondition(
        lookup.status
        ===
        404,

        `TEST_REPOSITORY_ALREADY_EXISTS:${repositoryName}`
    );

}


async function createRemoteRepository(
    repositoryName
) {

    await ensureRemoteAbsent(
        repositoryName
    );


    const created =
        await createRepository(
            secretRef,
            {
                name:
                    repositoryName,

                description:
                    'Temporary StagePilot S06/W03 workspace acceptance repository.',

                isPrivate:
                    true
            }
        );


    requireCondition(
        created.status
        ===
        201,

        `REMOTE_CREATE_FAILED:${repositoryName}:${created.status}`
    );


    requireCondition(
        created.data?.private
        ===
        true,

        `REMOTE_NOT_PRIVATE:${repositoryName}`
    );


    return created.data;

}


async function createProjectFixture(
    label
) {

    const result =
        await db.query(
            `
            INSERT INTO projects (
                slug,
                name,
                description,
                status,
                settings
            )
            VALUES (
                $1,
                $2,
                $3,
                'draft',
                $4::jsonb
            )
            RETURNING id
            `,
            [
                `stagepilot-s06-w03-${label}-${stamp}`,

                `StagePilot S06/W03 ${label} Fixture`,

                'Temporary live workspace acceptance project.',

                JSON.stringify({
                    internal:
                        true,

                    acceptanceOnly:
                        true
                })
            ]
        );


    const id =
        result.rows[0].id;


    projectIds.push(
        id
    );


    return id;

}


async function createRepositoryBinding({
    projectId,
    repository
}) {

    const request =
        await db.query(
            `
            INSERT INTO github_repository_requests (
                request_key,
                project_id,
                access_profile_id,
                mode,
                owner_login,
                repository_name,
                visibility,
                default_branch,
                request_fingerprint,
                status,
                approved_at,
                completed_at,
                github_repository_id,
                result_json
            )
            VALUES (
                $1,
                $2,
                $3,
                'attach',
                $4,
                $5,
                'private',
                'main',
                $6,
                'succeeded',
                now(),
                now(),
                $7,
                $8::jsonb
            )
            RETURNING id
            `,
            [
                `s06-w03-live-${repository.name}-${stamp}`,

                projectId,

                profileId,

                owner,

                repository.name,

                'f'.repeat(
                    64
                ),

                repository.id,

                JSON.stringify({
                    liveAcceptance:
                        true
                })
            ]
        );


    const binding =
        await db.query(
            `
            INSERT INTO github_project_repositories (
                project_id,
                access_profile_id,
                source_request_id,
                github_repository_id,
                owner_login,
                repository_name,
                full_name,
                html_url,
                ssh_url,
                visibility,
                default_branch,
                binding_mode,
                created_by_stagepilot,
                status,
                metadata
            )
            VALUES (
                $1,
                $2,
                $3,
                $4,
                $5,
                $6,
                $7,
                $8,
                $9,
                'private',
                'main',
                'attached',
                false,
                'ready',
                $10::jsonb
            )
            RETURNING *
            `,
            [
                projectId,

                profileId,

                request.rows[0].id,

                repository.id,

                repository.owner.login,

                repository.name,

                repository.full_name,

                repository.html_url,

                repository.ssh_url,

                JSON.stringify({
                    liveAcceptance:
                        true
                })
            ]
        );


    return binding.rows[0];

}


async function createLocalWorkspace({
    workspace,
    repository
}) {

    await mkdir(
        workspace,
        {
            recursive:
                true
        }
    );


    await runGit(
        workspace,
        [
            'init',
            '-b',
            'main'
        ]
    );


    await runGit(
        workspace,
        [
            'config',
            'user.name',
            'StagePilot Acceptance'
        ]
    );


    await runGit(
        workspace,
        [
            'config',
            'user.email',
            'stagepilot@localhost'
        ]
    );


    await writeFile(
        `${workspace}/README.md`,
        `# ${repository.name}\n`,
        'utf8'
    );


    await runGit(
        workspace,
        [
            'add',
            'README.md'
        ]
    );


    await runGit(
        workspace,
        [
            'commit',
            '-m',
            'StagePilot workspace acceptance fixture'
        ]
    );


    await runGit(
        workspace,
        [
            'remote',
            'add',
            'origin',
            repository.ssh_url
        ]
    );


    return {
        headSha:
            await runGit(
                workspace,
                [
                    'rev-parse',
                    'HEAD'
                ]
            ),

        remote:
            await runGit(
                workspace,
                [
                    'remote',
                    'get-url',
                    'origin'
                ]
            ),

        branch:
            await runGit(
                workspace,
                [
                    'branch',
                    '--show-current'
                ]
            )
    };

}


async function deleteRemoteRepository(
    repositoryName
) {

    const lookup =
        await getRepository(
            secretRef,
            owner,
            repositoryName
        );


    if (
        lookup.status
        ===
        404
    ) {

        return true;

    }


    requireCondition(
        lookup.ok,
        `CLEANUP_LOOKUP_FAILED:${repositoryName}`
    );


    const deleted =
        await deleteRepository(
            secretRef,
            owner,
            repositoryName
        );


    requireCondition(
        deleted.status
        ===
        204,

        `CLEANUP_DELETE_FAILED:${repositoryName}:${deleted.status}`
    );


    for (
        let attempt = 1;
        attempt <= 8;
        attempt += 1
    ) {

        const after =
            await getRepository(
                secretRef,
                owner,
                repositoryName
            );


        if (
            after.status
            ===
            404
        ) {

            return true;

        }


        await new Promise(
            resolve =>
                setTimeout(
                    resolve,
                    750
                )
        );

    }


    throw new Error(
        `DELETE_NOT_CONFIRMED:${repositoryName}`
    );

}


let mainError =
    null;


try {

    const remoteA =
        await createRemoteRepository(
            names.a
        );


    const remoteB =
        await createRemoteRepository(
            names.b
        );


    const projectA =
        await createProjectFixture(
            'a'
        );


    const projectB =
        await createProjectFixture(
            'b'
        );


    const bindingA =
        await createRepositoryBinding({
            projectId:
                projectA,

            repository:
                remoteA
        });


    const bindingB =
        await createRepositoryBinding({
            projectId:
                projectB,

            repository:
                remoteB
        });


    const localA =
        await createLocalWorkspace({
            workspace:
                workspaces.a,

            repository:
                remoteA
        });


    const localB =
        await createLocalWorkspace({
            workspace:
                workspaces.b,

            repository:
                remoteB
        });


    requireCondition(
        localA.remote
        ===
        remoteA.ssh_url,

        'WORKSPACE_A_REMOTE_CONFIGURATION_FAILED'
    );


    requireCondition(
        localB.remote
        ===
        remoteB.ssh_url,

        'WORKSPACE_B_REMOTE_CONFIGURATION_FAILED'
    );


    requireCondition(
        localA.branch
        ===
        'main'
        &&
        localB.branch
        ===
        'main',

        'LOCAL_BRANCH_CONFIGURATION_FAILED'
    );


    const registeredA =
        await registerProjectWorkspace({
            db,

            projectId:
                projectA,

            repositoryBindingId:
                bindingA.id,

            workspacePath:
                workspaces.a,

            remoteName:
                'origin'
        });


    const registeredB =
        await registerProjectWorkspace({
            db,

            projectId:
                projectB,

            repositoryBindingId:
                bindingB.id,

            workspacePath:
                workspaces.b,

            remoteName:
                'origin'
        });


    requireCondition(
        registeredA.row.project_id
        ===
        projectA,

        'PROJECT_A_REGISTRATION_FAILED'
    );


    requireCondition(
        registeredB.row.project_id
        ===
        projectB,

        'PROJECT_B_REGISTRATION_FAILED'
    );


    requireCondition(
        registeredA.actual.remoteUrl
        ===
        remoteA.ssh_url,

        'PROJECT_A_ACTUAL_REMOTE_INSPECTION_FAILED'
    );


    requireCondition(
        registeredB.actual.remoteUrl
        ===
        remoteB.ssh_url,

        'PROJECT_B_ACTUAL_REMOTE_INSPECTION_FAILED'
    );


    requireCondition(
        registeredA.actual.headSha
        ===
        localA.headSha,

        'PROJECT_A_HEAD_INSPECTION_FAILED'
    );


    requireCondition(
        registeredB.actual.headSha
        ===
        localB.headSha,

        'PROJECT_B_HEAD_INSPECTION_FAILED'
    );


    const verifiedA =
        await verifyProjectWorkspaceForMutation({
            db,

            projectId:
                projectA,

            workspacePath:
                workspaces.a
        });


    requireCondition(
        verifiedA.verified.mutationAllowed
        ===
        true,

        'PROJECT_A_VALID_WORKSPACE_REJECTED'
    );


    let transportCalls =
        0;


    const allowedTransport =
        await guardedGitTransport({
            db,

            projectId:
                projectA,

            workspacePath:
                workspaces.a,

            transport:
                async () => {

                    transportCalls +=
                        1;


                    return {
                        simulated:
                            true,

                        pushExecuted:
                            false
                    };

                }
        });


    requireCondition(
        allowedTransport.verifiedBeforeTransport
        ===
        true,

        'VALID_TRANSPORT_NOT_PREVERIFIED'
    );


    requireCondition(
        transportCalls
        ===
        1,

        'VALID_TRANSPORT_NOT_REACHED'
    );


    const callsBeforeCrossProject =
        transportCalls;


    let crossProjectRejected =
        false;

    let crossProjectError =
        '';


    try {

        await guardedGitTransport({
            db,

            projectId:
                projectA,

            workspacePath:
                workspaces.b,

            transport:
                async () => {

                    transportCalls +=
                        1;


                    return {
                        shouldNeverRun:
                            true
                    };

                }
        });

    } catch (
        error
    ) {

        crossProjectRejected =
            true;

        crossProjectError =
            error?.message
            ??
            String(
                error
            );

    }


    requireCondition(
        crossProjectRejected,
        'CROSS_PROJECT_WORKSPACE_NOT_REJECTED'
    );


    requireCondition(
        transportCalls
        ===
        callsBeforeCrossProject,

        'CROSS_PROJECT_REQUEST_REACHED_TRANSPORT'
    );


    await runGit(
        workspaces.a,
        [
            'remote',
            'set-url',
            'origin',
            remoteB.ssh_url
        ]
    );


    const callsBeforeRemoteMismatch =
        transportCalls;


    let remoteMismatchRejected =
        false;

    let remoteMismatchError =
        '';


    try {

        await guardedGitTransport({
            db,

            projectId:
                projectA,

            workspacePath:
                workspaces.a,

            transport:
                async () => {

                    transportCalls +=
                        1;


                    return {
                        shouldNeverRun:
                            true
                    };

                }
        });

    } catch (
        error
    ) {

        remoteMismatchRejected =
            true;

        remoteMismatchError =
            error?.message
            ??
            String(
                error
            );

    }


    requireCondition(
        remoteMismatchRejected,
        'CROSS_PROJECT_REMOTE_NOT_REJECTED'
    );


    requireCondition(
        transportCalls
        ===
        callsBeforeRemoteMismatch,

        'REMOTE_MISMATCH_REACHED_TRANSPORT'
    );


    await runGit(
        workspaces.a,
        [
            'remote',
            'set-url',
            'origin',
            remoteA.ssh_url
        ]
    );


    const restored =
        await verifyProjectWorkspaceForMutation({
            db,

            projectId:
                projectA,

            workspacePath:
                workspaces.a
        });


    requireCondition(
        restored.verified.mutationAllowed
        ===
        true,

        'RESTORED_PROJECT_A_WORKSPACE_NOT_VALID'
    );


    const workspaceRows =
        await db.query(
            `
            SELECT
                project_id,
                repository_binding_id,
                workspace_path,
                remote_url,
                branch_name,
                verified_head_sha,
                status
            FROM github_project_workspaces
            WHERE project_id=ANY($1::uuid[])
            ORDER BY project_id
            `,
            [
                [
                    projectA,
                    projectB
                ]
            ]
        );


    requireCondition(
        workspaceRows.rowCount
        ===
        2,

        'EXPECTED_TWO_WORKSPACE_ROWS'
    );


    report.registration = {
        repositoriesCreated:
            2,

        workspacesRegistered:
            2,

        gitRemoteInspected:
            true,

        gitBranchInspected:
            true,

        gitHeadInspected:
            true,

        repositoryIds: [
            remoteA.id,
            remoteB.id
        ]
    };


    report.guards = {
        validProjectReachedTransport:
            true,

        validTransportCalls:
            1,

        crossProjectWorkspaceRejected:
            true,

        crossProjectWorkspaceError:
            crossProjectError,

        crossProjectWorkspaceTransportCalls:
            0,

        crossProjectRemoteRejected:
            true,

        crossProjectRemoteError:
            remoteMismatchError,

        crossProjectRemoteTransportCalls:
            0,

        pushExecutedDuringAcceptance:
            false
    };


} catch (
    error
) {

    mainError =
        error;

} finally {

    const cleanupErrors = [];


    for (
        const workspace
        of Object.values(
            workspaces
        )
    ) {

        try {

            const resolvedRoot =
                String(
                    workspace
                );


            if (
                !resolvedRoot.startsWith(
                    `${workspaceRoot}/s06-w03-`
                )
            ) {

                throw new Error(
                    'UNSAFE_WORKSPACE_CLEANUP_PATH'
                );

            }


            await rm(
                resolvedRoot,
                {
                    recursive:
                        true,

                    force:
                        true
                }
            );

        } catch (
            error
        ) {

            cleanupErrors.push(
                `WORKSPACE:${error?.message ?? error}`
            );

        }

    }


    for (
        const projectId
        of projectIds
    ) {

        try {

            await db.query(
                `
                DELETE FROM projects
                WHERE id=$1
                `,
                [
                    projectId
                ]
            );

        } catch (
            error
        ) {

            cleanupErrors.push(
                `PROJECT:${error?.message ?? error}`
            );

        }

    }


    for (
        const repositoryName
        of Object.values(
            names
        )
    ) {

        try {

            await deleteRemoteRepository(
                repositoryName
            );

        } catch (
            error
        ) {

            cleanupErrors.push(
                `REPOSITORY:${error?.message ?? error}`
            );

        }

    }


    let projectLeftovers =
        0;


    if (
        projectIds.length > 0
    ) {

        const result =
            await db.query(
                `
                SELECT COUNT(*)::int AS count
                FROM projects
                WHERE id=ANY($1::uuid[])
                `,
                [
                    projectIds
                ]
            );


        projectLeftovers =
            Number(
                result.rows[0]?.count
                ??
                0
            );

    }


    const remoteCleanup = {};


    for (
        const repositoryName
        of Object.values(
            names
        )
    ) {

        try {

            const result =
                await getRepository(
                    secretRef,
                    owner,
                    repositoryName
                );


            remoteCleanup[
                repositoryName
            ] =
                result.status
                ===
                404;

        } catch {

            remoteCleanup[
                repositoryName
            ] =
                false;

        }

    }


    report.cleanup = {
        workspacesDeleted:
            true,

        projectsDeleted:
            projectLeftovers
            ===
            0,

        repositoriesDeleted:
            Object.values(
                remoteCleanup
            ).every(
                value =>
                    value
                ===
                true
            ),

        cleanupErrors
    };


    db.release();

    await pool.end();


    if (
        cleanupErrors.length > 0
        ||
        report.cleanup.projectsDeleted
        !==
        true
        ||
        report.cleanup.repositoriesDeleted
        !==
        true
    ) {

        if (!mainError) {

            mainError =
                new Error(
                    `LIVE_ACCEPTANCE_CLEANUP_FAILED:${cleanupErrors.join(';')}`
                );

        }

    }

}


if (mainError) {

    process.stderr.write(
        JSON.stringify({
            error:
                mainError?.message
                ??
                String(
                    mainError
                ),

            report
        })
    );

    process.exit(
        1
    );

}


process.stdout.write(
    JSON.stringify({
        result:
            'PASS',

        registration:
            report.registration,

        guards:
            report.guards,

        cleanup:
            report.cleanup
    })
);

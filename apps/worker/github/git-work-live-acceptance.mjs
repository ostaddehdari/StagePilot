import {
    mkdir,
    readFile,
    rm,
    writeFile,
    chmod
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
    getRepository,
    githubRequest
} from './github-api-client.mjs';

import {
    buildWorkCommitMessage,
    stageBranchName,
    verifyCommitReadiness,
    decideGitLifecycleAction,
    ensureSameCommitOnRetry
} from './git-work-lifecycle.mjs';

import {
    loadLifecycle,
    persistCommitCreated,
    persistPushIntent,
    persistPushFailure,
    persistPushSuccess,
    persistVerified
} from './git-work-orchestrator.mjs';


const owner =
    process.env.STAGEPILOT_GITHUB_OWNER;


const profileId =
    process.env.STAGEPILOT_GITHUB_PROFILE_ID;


const secretRef =
    process.env.STAGEPILOT_GITHUB_API_SECRET_REF;


const workspaceRoot =
    process.env.STAGEPILOT_WORKSPACE_ROOT;


const acceptanceRoot =
    process.env.STAGEPILOT_GITHUB_ACCEPTANCE_ROOT;


const knownHosts =
    process.env.STAGEPILOT_GITHUB_KNOWN_HOSTS;


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
    ||
    !acceptanceRoot
    ||
    !knownHosts
) {

    throw new Error(
        'LIVE_ACCEPTANCE_CONFIGURATION_MISSING'
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


const repositoryName =
    `stagepilot-w05-git-pending-${stamp}`;


const workspace =
    `${workspaceRoot}/s06-w05-${stamp}`;


const keyDirectory =
    `${acceptanceRoot}/s06-w05-${stamp}`;


const keyPath =
    `${keyDirectory}/deploy-key`;


const publicKeyPath =
    `${keyPath}.pub`;


const stageKey =
    'S06';


const workKey =
    'W05';


const runKey =
    `w05-live-${stamp}`;


const branchName =
    stageBranchName(
        stageKey
    );


let projectId =
    null;


let lifecycleId =
    null;


let repositoryCreated =
    false;


const report = {
    commit: {},
    failure: {},
    retry: {},
    remote: {},
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


function command(
    executable,
    args,
    {
        cwd = workspace,
        env = {}
    } = {}
) {

    return new Promise(
        (
            resolvePromise,
            rejectPromise
        ) => {

            const child =
                spawn(
                    executable,
                    args,
                    {
                        cwd,

                        env: {
                            PATH:
                                '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',

                            HOME:
                                cwd,

                            LANG:
                                'C.UTF-8',

                            LC_ALL:
                                'C.UTF-8',

                            GIT_TERMINAL_PROMPT:
                                '0',

                            ...env
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


async function requiredCommand(
    executable,
    args,
    options,
    label
) {

    const result =
        await command(
            executable,
            args,
            options
        );


    if (
        result.code
        !==
        0
    ) {

        throw new Error(
            `${label}:${result.code}`
        );

    }


    return result.stdout.trim();

}


async function git(
    args,
    env = {}
) {

    return requiredCommand(
        '/usr/bin/git',
        [
            '-C',
            workspace,
            ...args
        ],
        {
            cwd:
                workspace,

            env
        },
        'GIT_COMMAND_FAILED'
    );

}


async function deleteRemoteRepository() {

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
        `REMOTE_CLEANUP_LOOKUP_FAILED:${lookup.status}`
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

        `REMOTE_DELETE_FAILED:${deleted.status}`
    );


    for (
        let attempt = 1;
        attempt <= 10;
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
        'REMOTE_DELETE_NOT_CONFIRMED'
    );

}


let mainError =
    null;


try {

    // ========================================================
    // A. VERIFIED IMPLEMENTATION / TEST / WORKSPACE GATES
    // ========================================================

    verifyCommitReadiness({
        implementationVerified:
            true,

        testsVerified:
            true,

        workspaceVerified:
            true,

        implementationRef:
            `run:${runKey}`
    });


    // ========================================================
    // B. CREATE TEMP PROJECT
    // ========================================================

    const projectResult =
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
                `stagepilot-s06-w05-${stamp}`,

                'StagePilot S06/W05 Git Pending Acceptance',

                'Temporary live acceptance project.',

                JSON.stringify({
                    internal:
                        true,

                    acceptanceOnly:
                        true
                })
            ]
        );


    projectId =
        projectResult.rows[0].id;


    // ========================================================
    // C. CREATE EMPTY PRIVATE REPOSITORY
    // ========================================================

    const before =
        await getRepository(
            secretRef,
            owner,
            repositoryName
        );


    requireCondition(
        before.status
        ===
        404,

        'TEMP_REPOSITORY_ALREADY_EXISTS'
    );


    const created =
        await createRepository(
            secretRef,
            {
                name:
                    repositoryName,

                description:
                    'Temporary StagePilot W05 Git lifecycle acceptance.',

                isPrivate:
                    true
            }
        );


    requireCondition(
        created.status
        ===
        201,

        `TEMP_REPOSITORY_CREATE_FAILED:${created.status}`
    );


    repositoryCreated =
        true;


    // ========================================================
    // D. CREATE REPOSITORY-SPECIFIC DEPLOY KEY
    // ========================================================

    await mkdir(
        keyDirectory,
        {
            recursive:
                true
        }
    );


    await chmod(
        keyDirectory,
        0o700
    );


    await requiredCommand(
        '/usr/bin/ssh-keygen',
        [
            '-q',
            '-t',
            'ed25519',
            '-N',
            '',
            '-C',
            `stagepilot-w05-${stamp}`,
            '-f',
            keyPath
        ],
        {
            cwd:
                keyDirectory
        },
        'SSH_KEYGEN_FAILED'
    );


    await chmod(
        keyPath,
        0o600
    );


    const publicKey =
        (
            await readFile(
                publicKeyPath,
                'utf8'
            )
        ).trim();


    const keyResponse =
        await githubRequest({
            secretRef,

            method:
                'POST',

            path:
                `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repositoryName)}/keys`,

            body: {
                title:
                    `StagePilot W05 ${stamp}`,

                key:
                    publicKey,

                read_only:
                    false
            }
        });


    requireCondition(
        keyResponse.status
        ===
        201,

        `DEPLOY_KEY_CREATE_FAILED:${keyResponse.status}`
    );


    // ========================================================
    // E. CREATE ONE IMPLEMENTATION ARTIFACT
    // ========================================================

    await mkdir(
        workspace,
        {
            recursive:
                true
        }
    );


    await writeFile(
        `${workspace}/WORK_RESULT.txt`,
        [
            'StagePilot S06/W05 live acceptance',
            `run=${runKey}`,
            ''
        ].join(
            '\n'
        ),
        'utf8'
    );


    await requiredCommand(
        '/usr/bin/git',
        [
            '-C',
            workspace,
            'init',
            '-b',
            branchName
        ],
        {
            cwd:
                workspace
        },
        'GIT_INIT_FAILED'
    );


    await git([
        'config',
        'user.name',
        'StagePilot'
    ]);


    await git([
        'config',
        'user.email',
        'stagepilot@localhost'
    ]);


    await git([
        'add',
        'WORK_RESULT.txt'
    ]);


    const commitMessage =
        buildWorkCommitMessage({
            stageKey,
            workKey,
            runKey,
            summary:
                'verify push-only recovery'
        });


    // ========================================================
    // F. CREATE DURABLE READY_TO_COMMIT ROW
    // ========================================================

    const lifecycleResult =
        await db.query(
            `
            INSERT INTO git_work_lifecycles (
                lifecycle_key,
                project_id,
                stage_key,
                work_key,
                run_key,
                repository,
                workspace_path,
                remote_name,
                branch_name,
                commit_message,
                implementation_ref,
                implementation_verified,
                tests_verified,
                workspace_verified,
                state,
                result_json
            )
            VALUES (
                $1,
                $2,
                $3,
                $4,
                $5,
                $6,
                $7,
                'origin',
                $8,
                $9,
                $10,
                true,
                true,
                true,
                'READY_TO_COMMIT',
                $11::jsonb
            )
            RETURNING id
            `,
            [
                `s06-w05-live-${stamp}`,

                projectId,

                stageKey,

                workKey,

                runKey,

                `https://github.com/${owner}/${repositoryName}`,

                workspace,

                branchName,

                commitMessage,

                `run:${runKey}`,

                JSON.stringify({
                    implementationExecutions:
                        1,

                    commitCreations:
                        0,

                    acceptanceOnly:
                        true
                })
            ]
        );


    lifecycleId =
        lifecycleResult.rows[0].id;


    // ========================================================
    // G. CREATE EXACTLY ONE COMMIT
    // ========================================================

    await git([
        'commit',
        '-m',
        commitMessage
    ]);


    const localSha =
        await git([
            'rev-parse',
            'HEAD'
        ]);


    const localCommitCount =
        await git([
            'rev-list',
            '--count',
            'HEAD'
        ]);


    requireCondition(
        localCommitCount
        ===
        '1',

        'EXPECTED_ONE_LOCAL_COMMIT'
    );


    await persistCommitCreated({
        db,
        lifecycleId,
        localCommitSha:
            localSha
    });


    await git([
        'remote',
        'add',
        'origin',
        created.data.ssh_url
    ]);


    // ========================================================
    // H. PERSIST PUSH_INTENT BEFORE FAILED TRANSPORT
    // ========================================================

    const firstIntent =
        await persistPushIntent({
            db,
            lifecycleId,
            localCommitSha:
                localSha
        });


    requireCondition(
        firstIntent.state
        ===
        'PUSH_INTENT',

        'FIRST_PUSH_INTENT_NOT_PERSISTED'
    );


    requireCondition(
        firstIntent.push_attempts
        ===
        1,

        'FIRST_PUSH_ATTEMPT_COUNTER_INVALID'
    );


    // ========================================================
    // I. INTENTIONALLY FAIL TRANSPORT
    // ========================================================

    const failedPush =
        await command(
            '/usr/bin/git',
            [
                '-C',
                workspace,
                'push',
                'origin',
                `${branchName}:${branchName}`
            ],
            {
                cwd:
                    workspace,

                env: {
                    GIT_SSH_COMMAND:
                        '/usr/bin/false'
                }
            }
        );


    requireCondition(
        failedPush.code
        !==
        0,

        'SIMULATED_PUSH_FAILURE_DID_NOT_FAIL'
    );


    await persistPushFailure({
        db,
        lifecycleId,
        localCommitSha:
            localSha,
        reason:
            'SIMULATED_TRANSPORT_FAILURE'
    });


    const pending =
        await loadLifecycle(
            db,
            lifecycleId
        );


    requireCondition(
        pending.state
        ===
        'GIT_PENDING',

        'GIT_PENDING_NOT_PERSISTED'
    );


    requireCondition(
        pending.push_attempts
        ===
        1,

        'FAILED_PUSH_ATTEMPT_COUNT_INVALID'
    );


    requireCondition(
        pending.error_json?.retryAction
        ===
        'PUSH_ONLY',

        'GIT_PENDING_RETRY_ACTION_INVALID'
    );


    requireCondition(
        pending.error_json?.rerunImplementation
        ===
        false,

        'GIT_PENDING_RERUN_IMPLEMENTATION_TRUE'
    );


    requireCondition(
        pending.error_json?.recreateCommit
        ===
        false,

        'GIT_PENDING_RECREATE_COMMIT_TRUE'
    );


    const pendingAction =
        decideGitLifecycleAction({
            state:
                pending.state,

            localCommitSha:
                pending.local_commit_sha
        });


    requireCondition(
        pendingAction.action
        ===
        'RETRY_PUSH_ONLY',

        'GIT_PENDING_ACTION_NOT_PUSH_ONLY'
    );


    requireCondition(
        pendingAction.rerunImplementation
        ===
        false,

        'GIT_PENDING_ACTION_RERUNS_IMPLEMENTATION'
    );


    const headAfterFailure =
        await git([
            'rev-parse',
            'HEAD'
        ]);


    const commitCountAfterFailure =
        await git([
            'rev-list',
            '--count',
            'HEAD'
        ]);


    ensureSameCommitOnRetry({
        storedLocalCommitSha:
            pending.local_commit_sha,

        currentLocalCommitSha:
            headAfterFailure
    });


    requireCondition(
        headAfterFailure
        ===
        localSha,

        'LOCAL_SHA_CHANGED_AFTER_PUSH_FAILURE'
    );


    requireCondition(
        commitCountAfterFailure
        ===
        '1',

        'COMMIT_RECREATED_AFTER_PUSH_FAILURE'
    );


    // Verify remote branch still absent.
    const remoteBeforeRetry =
        await getRepository(
            secretRef,
            owner,
            repositoryName
        );


    requireCondition(
        remoteBeforeRetry.ok,
        'REMOTE_REPOSITORY_MISSING_BEFORE_RETRY'
    );


    const branchBeforeRetry =
        await githubRequest({
            secretRef,

            path:
                `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repositoryName)}/branches/${encodeURIComponent(branchName)}`
        });


    requireCondition(
        branchBeforeRetry.status
        ===
        404,

        'FAILED_PUSH_UNEXPECTEDLY_CREATED_REMOTE_BRANCH'
    );


    // ========================================================
    // J. RETRY PUSH ONLY
    // ========================================================

    const secondIntent =
        await persistPushIntent({
            db,
            lifecycleId,
            localCommitSha:
                localSha
        });


    requireCondition(
        secondIntent.push_attempts
        ===
        2,

        'SECOND_PUSH_ATTEMPT_COUNTER_INVALID'
    );


    const realSshCommand =
        [
            '/usr/bin/ssh',

            '-i',
            keyPath,

            '-o',
            'IdentitiesOnly=yes',

            '-o',
            'BatchMode=yes',

            '-o',
            'StrictHostKeyChecking=accept-new',

            '-o',
            `UserKnownHostsFile=${knownHosts}`,

            '-o',
            'ConnectTimeout=15'
        ].join(
            ' '
        );


    await git(
        [
            'push',
            '-u',
            'origin',
            `${branchName}:${branchName}`
        ],
        {
            GIT_SSH_COMMAND:
                realSshCommand
        }
    );


    // ========================================================
    // K. VERIFY REMOTE SHA
    // ========================================================

    const lsRemote =
        await git(
            [
                'ls-remote',
                'origin',
                `refs/heads/${branchName}`
            ],
            {
                GIT_SSH_COMMAND:
                    realSshCommand
            }
        );


    const remoteSha =
        lsRemote
            .trim()
            .split(
                /\s+/
            )[0]
            ??
            '';


    requireCondition(
        remoteSha
        ===
        localSha,

        'REMOTE_SHA_DOES_NOT_MATCH_LOCAL_COMMIT'
    );


    await persistPushSuccess({
        db,
        lifecycleId,
        localCommitSha:
            localSha,
        remoteCommitSha:
            remoteSha
    });


    const verifiedRow =
        await persistVerified({
            db,
            lifecycleId
        });


    requireCondition(
        verifiedRow.state
        ===
        'VERIFIED',

        'FINAL_LIFECYCLE_NOT_VERIFIED'
    );


    // ========================================================
    // L. FINAL DURABLE ASSERTIONS
    // ========================================================

    const final =
        await loadLifecycle(
            db,
            lifecycleId
        );


    requireCondition(
        final.state
        ===
        'VERIFIED',

        'FINAL_STATE_INVALID'
    );


    requireCondition(
        final.local_commit_sha
        ===
        localSha,

        'FINAL_LOCAL_SHA_CHANGED'
    );


    requireCondition(
        final.remote_commit_sha
        ===
        localSha,

        'FINAL_REMOTE_SHA_INVALID'
    );


    requireCondition(
        final.push_attempts
        ===
        2,

        'EXPECTED_TWO_PUSH_ATTEMPTS'
    );


    requireCondition(
        Number(
            final.result_json?.implementationExecutions
            ??
            0
        )
        ===
        1,

        'IMPLEMENTATION_RERAN'
    );


    requireCondition(
        Number(
            final.result_json?.commitCreations
            ??
            0
        )
        ===
        1,

        'COMMIT_RECREATED'
    );


    const finalHead =
        await git([
            'rev-parse',
            'HEAD'
        ]);


    const finalCommitCount =
        await git([
            'rev-list',
            '--count',
            'HEAD'
        ]);


    requireCondition(
        finalHead
        ===
        localSha,

        'FINAL_HEAD_CHANGED'
    );


    requireCondition(
        finalCommitCount
        ===
        '1',

        'FINAL_COMMIT_COUNT_INVALID'
    );


    const remoteBranch =
        await githubRequest({
            secretRef,

            path:
                `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repositoryName)}/branches/${encodeURIComponent(branchName)}`
        });


    requireCondition(
        remoteBranch.ok,

        `REMOTE_STAGE_BRANCH_LOOKUP_FAILED:${remoteBranch.status}`
    );


    requireCondition(
        remoteBranch.data?.commit?.sha
        ===
        localSha,

        'REMOTE_BRANCH_SHA_MISMATCH'
    );


    report.commit = {
        stage:
            stageKey,

        work:
            workKey,

        runKey,

        branch:
            branchName,

        localSha,

        commitCount:
            1,

        implementationExecutions:
            1,

        commitCreations:
            1
    };


    report.failure = {
        simulatedTransportFailure:
            true,

        firstPushFailed:
            true,

        stateAfterFailure:
            'GIT_PENDING',

        pushAttemptsAfterFailure:
            1,

        retryAction:
            'PUSH_ONLY',

        rerunImplementation:
            false,

        recreateCommit:
            false,

        remoteBranchCreatedByFailedPush:
            false
    };


    report.retry = {
        sameLocalCommit:
            true,

        implementationExecutions:
            1,

        commitCreations:
            1,

        totalPushAttempts:
            2,

        forcePush:
            false
    };


    report.remote = {
        branch:
            branchName,

        localSha,

        remoteSha,

        shaVerified:
            true,

        lifecycleState:
            'VERIFIED'
    };


} catch (
    error
) {

    mainError =
        error;

} finally {

    const cleanupErrors = [];


    try {

        if (
            projectId
        ) {

            await db.query(
                `
                DELETE FROM projects
                WHERE id=$1
                `,
                [
                    projectId
                ]
            );

        }

    } catch (
        error
    ) {

        cleanupErrors.push(
            `PROJECT:${error?.message ?? error}`
        );

    }


    try {

        if (
            repositoryCreated
        ) {

            await deleteRemoteRepository();

        }

    } catch (
        error
    ) {

        cleanupErrors.push(
            `REPOSITORY:${error?.message ?? error}`
        );

    }


    try {

        if (
            workspace.startsWith(
                `${workspaceRoot}/s06-w05-`
            )
        ) {

            await rm(
                workspace,
                {
                    recursive:
                        true,

                    force:
                        true
                }
            );

        } else {

            throw new Error(
                'UNSAFE_WORKSPACE_CLEANUP_PATH'
            );

        }

    } catch (
        error
    ) {

        cleanupErrors.push(
            `WORKSPACE:${error?.message ?? error}`
        );

    }


    try {

        if (
            keyDirectory.startsWith(
                `${acceptanceRoot}/s06-w05-`
            )
        ) {

            await rm(
                keyDirectory,
                {
                    recursive:
                        true,

                    force:
                        true
                }
            );

        } else {

            throw new Error(
                'UNSAFE_KEY_CLEANUP_PATH'
            );

        }

    } catch (
        error
    ) {

        cleanupErrors.push(
            `KEY:${error?.message ?? error}`
        );

    }


    let projectDeleted =
        true;


    if (
        projectId
    ) {

        try {

            const result =
                await db.query(
                    `
                    SELECT COUNT(*)::int AS count
                    FROM projects
                    WHERE id=$1
                    `,
                    [
                        projectId
                    ]
                );


            projectDeleted =
                Number(
                    result.rows[0]?.count
                    ??
                    0
                )
                ===
                0;

        } catch {

            projectDeleted =
                false;

        }

    }


    let repositoryDeleted =
        true;


    try {

        const result =
            await getRepository(
                secretRef,
                owner,
                repositoryName
            );


        repositoryDeleted =
            result.status
            ===
            404;

    } catch {

        repositoryDeleted =
            false;

    }


    report.cleanup = {
        projectDeleted,

        repositoryDeleted,

        workspaceDeleted:
            true,

        deployKeyFilesDeleted:
            true,

        cleanupErrors
    };


    db.release();

    await pool.end();


    if (
        cleanupErrors.length > 0
        ||
        projectDeleted
        !==
        true
        ||
        repositoryDeleted
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


if (
    mainError
) {

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

        commit:
            report.commit,

        failure:
            report.failure,

        retry:
            report.retry,

        remote:
            report.remote,

        cleanup:
            report.cleanup
    })
);

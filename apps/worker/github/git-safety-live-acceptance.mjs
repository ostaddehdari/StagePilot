import {
    access,
    chmod,
    mkdir,
    readFile,
    rm,
    writeFile
} from 'node:fs/promises';

import {
    constants as fsConstants
} from 'node:fs';

import {
    dirname
} from 'node:path';

import {
    spawn
} from 'node:child_process';

import {
    createHash
} from 'node:crypto';

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
    classifyPushFailure,
    validateAutomatedGitArgs
} from './git-safety-policy.mjs';

import {
    inspectWorkspaceState,
    inspectRemoteRelation,
    inspectHooksIsolation,
    persistSafetyReport,
    createSafetyReport
} from './git-safety-inspector.mjs';


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


const safeHooksPath =
    process.env.STAGEPILOT_SAFE_HOOKS_PATH;


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
    ||
    !safeHooksPath
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
    `stagepilot-w06-safety-${stamp}`;


const fixtureRoot =
    `${workspaceRoot}/s06-w06-${stamp}`;


const remoteA =
    `${fixtureRoot}/remote-a`;


const remoteB =
    `${fixtureRoot}/remote-b`;


const permissionWorkspace =
    `${fixtureRoot}/permission`;


const dirtyWorkspace =
    `${fixtureRoot}/dirty`;


const conflictWorkspace =
    `${fixtureRoot}/conflict`;


const keyRoot =
    `${acceptanceRoot}/s06-w06-${stamp}`;


const writeKey =
    `${keyRoot}/write-key`;


const readKey =
    `${keyRoot}/read-key`;


const branchName =
    'stage/S06';


const permissionBranch =
    'permission-test';


let projectId =
    null;


let repositoryCreated =
    false;


const report = {
    hooks: {},
    dirty: {},
    conflict: {},
    divergence: {},
    permission: {},
    database: {},
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


function sha256(
    value
) {

    return createHash(
        'sha256'
    )
        .update(
            value
        )
        .digest(
            'hex'
        );

}


function command(
    executable,
    args,
    {
        cwd = fixtureRoot,
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
    errorCode
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

        const error =
            new Error(
                `${errorCode}:${result.code}`
            );


        error.stderr =
            result.stderr;


        throw error;

    }


    return result.stdout.trim();

}


async function gitRequired(
    workspace,
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


async function gitResult(
    workspace,
    args,
    env = {}
) {

    return command(
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
        }
    );

}


async function configureRepository(
    workspace
) {

    await gitRequired(
        workspace,
        [
            'config',
            'user.name',
            'StagePilot'
        ]
    );


    await gitRequired(
        workspace,
        [
            'config',
            'user.email',
            'stagepilot@localhost'
        ]
    );


    await gitRequired(
        workspace,
        [
            'config',
            'core.hooksPath',
            safeHooksPath
        ]
    );

}


async function generateKey(
    keyPath,
    label
) {

    await requiredCommand(
        '/usr/bin/ssh-keygen',
        [
            '-q',
            '-t',
            'ed25519',
            '-N',
            '',
            '-C',
            label,
            '-f',
            keyPath
        ],
        {
            cwd:
                keyRoot
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
                `${keyPath}.pub`,
                'utf8'
            )
        ).trim();


    requireCondition(
        publicKey.startsWith(
            'ssh-ed25519 '
        ),

        'PUBLIC_KEY_INVALID'
    );


    return publicKey;

}


function sshCommandFor(
    keyPath
) {

    return [
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

}


async function addDeployKey({
    publicKey,
    title,
    readOnly
}) {

    const response =
        await githubRequest({
            secretRef,

            method:
                'POST',

            path:
                `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repositoryName)}/keys`,

            body: {
                title,

                key:
                    publicKey,

                read_only:
                    readOnly
            }
        });


    requireCondition(
        response.status
        ===
        201,

        `DEPLOY_KEY_CREATE_FAILED:${response.status}`
    );


    return response.data;

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


async function createLocalRepository(
    workspace,
    branch = 'main'
) {

    await mkdir(
        workspace,
        {
            recursive:
                true
        }
    );


    await gitRequired(
        workspace,
        [
            'init',
            '-b',
            branch
        ]
    );


    await configureRepository(
        workspace
    );

}


let mainError =
    null;


try {

    // ========================================================
    // A. CREATE TEMPORARY DB PROJECT
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
                `stagepilot-s06-w06-${stamp}`,

                'StagePilot S06/W06 Git Safety Acceptance',

                'Temporary Stage 6 final Git safety acceptance project.',

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
    // B. CREATE PRIVATE TEMPORARY GITHUB REPOSITORY
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
                    'Temporary StagePilot S06/W06 live safety acceptance repository.',

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


    requireCondition(
        created.data?.private
        ===
        true,

        'TEMP_REPOSITORY_NOT_PRIVATE'
    );


    repositoryCreated =
        true;


    // ========================================================
    // C. CREATE WRITE + READ-ONLY DEPLOY KEYS
    // ========================================================

    await mkdir(
        keyRoot,
        {
            recursive:
                true
        }
    );


    await chmod(
        keyRoot,
        0o700
    );


    const writePublic =
        await generateKey(
            writeKey,
            `stagepilot-w06-write-${stamp}`
        );


    const readPublic =
        await generateKey(
            readKey,
            `stagepilot-w06-read-${stamp}`
        );


    await addDeployKey({
        publicKey:
            writePublic,

        title:
            `StagePilot W06 Write ${stamp}`,

        readOnly:
            false
    });


    await addDeployKey({
        publicKey:
            readPublic,

        title:
            `StagePilot W06 Read ${stamp}`,

        readOnly:
            true
    });


    const writeSsh =
        sshCommandFor(
            writeKey
        );


    const readSsh =
        sshCommandFor(
            readKey
        );


    // ========================================================
    // D. CREATE REMOTE-A BASE REPOSITORY
    // ========================================================

    await createLocalRepository(
        remoteA,
        branchName
    );


    await writeFile(
        `${remoteA}/shared.txt`,
        'base\n',
        'utf8'
    );


    await gitRequired(
        remoteA,
        [
            'add',
            'shared.txt'
        ]
    );


    await gitRequired(
        remoteA,
        [
            'commit',
            '-m',
            'StagePilot W06 base'
        ]
    );


    await gitRequired(
        remoteA,
        [
            'remote',
            'add',
            'origin',
            created.data.ssh_url
        ]
    );


    // ========================================================
    // E. PROVE UNTRUSTED .git/hooks IS NOT EXECUTED
    // ========================================================

    const unsafeHookPath =
        `${remoteA}/.git/hooks/pre-push`;


    const unsafeMarker =
        `${remoteA}/UNTRUSTED_HOOK_EXECUTED`;


    await mkdir(
        dirname(
            unsafeHookPath
        ),
        {
            recursive:
                true
        }
    );


    await writeFile(
        unsafeHookPath,
        [
            '#!/bin/sh',
            `echo executed > "${unsafeMarker}"`,
            'exit 99',
            ''
        ].join(
            '\n'
        ),
        'utf8'
    );


    await chmod(
        unsafeHookPath,
        0o755
    );


    const hookInspection =
        await inspectHooksIsolation({
            workspacePath:
                remoteA,

            expectedHooksPath:
                safeHooksPath
        });


    requireCondition(
        hookInspection.verification.verified
        ===
        true,

        'HOOKS_ISOLATION_NOT_VERIFIED'
    );


    validateAutomatedGitArgs([
        'push',
        'origin',
        `${branchName}:${branchName}`
    ]);


    await gitRequired(
        remoteA,
        [
            'push',
            '-u',
            'origin',
            `${branchName}:${branchName}`
        ],
        {
            GIT_SSH_COMMAND:
                writeSsh
        }
    );


    let unsafeHookExecuted =
        false;


    try {

        await access(
            unsafeMarker,
            fsConstants.F_OK
        );

        unsafeHookExecuted =
            true;

    } catch {

        unsafeHookExecuted =
            false;

    }


    requireCondition(
        unsafeHookExecuted
        ===
        false,

        'UNTRUSTED_REPOSITORY_HOOK_EXECUTED'
    );


    report.hooks = {
        configuredHooksPath:
            hookInspection.configuredHooksPath,

        isolated:
            true,

        untrustedRepositoryHookExecuted:
            false
    };


    // ========================================================
    // F. DIRTY TREE ACCEPTANCE
    // ========================================================

    await createLocalRepository(
        dirtyWorkspace,
        'main'
    );


    await writeFile(
        `${dirtyWorkspace}/user-file.txt`,
        'original user content\n',
        'utf8'
    );


    await gitRequired(
        dirtyWorkspace,
        [
            'add',
            'user-file.txt'
        ]
    );


    await gitRequired(
        dirtyWorkspace,
        [
            'commit',
            '-m',
            'Dirty fixture base'
        ]
    );


    await writeFile(
        `${dirtyWorkspace}/user-file.txt`,
        'manual user modification\n',
        'utf8'
    );


    await writeFile(
        `${dirtyWorkspace}/local-notes.txt`,
        'manual local notes\n',
        'utf8'
    );


    const dirtyTrackedBefore =
        await readFile(
            `${dirtyWorkspace}/user-file.txt`,
            'utf8'
        );


    const dirtyNotesBefore =
        await readFile(
            `${dirtyWorkspace}/local-notes.txt`,
            'utf8'
        );


    const dirtyHashBefore =
        sha256(
            dirtyTrackedBefore
            +
            '\n---\n'
            +
            dirtyNotesBefore
        );


    const dirtyInspection =
        await inspectWorkspaceState(
            dirtyWorkspace
        );


    requireCondition(
        dirtyInspection.classification.state
        ===
        'DIRTY_TREE',

        'DIRTY_TREE_NOT_DETECTED'
    );


    requireCondition(
        dirtyInspection.classification.safeToCommit
        ===
        false,

        'DIRTY_TREE_COMMIT_NOT_BLOCKED'
    );


    requireCondition(
        dirtyInspection.classification.safeToPush
        ===
        false,

        'DIRTY_TREE_PUSH_NOT_BLOCKED'
    );


    const dirtyTrackedAfter =
        await readFile(
            `${dirtyWorkspace}/user-file.txt`,
            'utf8'
        );


    const dirtyNotesAfter =
        await readFile(
            `${dirtyWorkspace}/local-notes.txt`,
            'utf8'
        );


    const dirtyHashAfter =
        sha256(
            dirtyTrackedAfter
            +
            '\n---\n'
            +
            dirtyNotesAfter
        );


    requireCondition(
        dirtyHashBefore
        ===
        dirtyHashAfter,

        'DIRTY_TREE_INSPECTION_MODIFIED_USER_FILES'
    );


    const dirtyReport =
        createSafetyReport({
            issueType:
                'DIRTY_TREE',

            status:
                'decision_required',

            decisionRequired:
                true,

            localEvidence: {
                state:
                    dirtyInspection.classification.state,

                statusLines:
                    dirtyInspection.classification.evidence?.statusLines
                    ??
                    [],

                userContentHashBefore:
                    dirtyHashBefore,

                userContentHashAfter:
                    dirtyHashAfter
            },

            remoteEvidence:
                {},

            metadata: {
                acceptance:
                    true,

                preserveManualChanges:
                    true,

                automaticClean:
                    false,

                automaticReset:
                    false,

                automaticStash:
                    false
            }
        });


    await persistSafetyReport({
        db,

        reportKey:
            `s06-w06-${stamp}-dirty`,

        projectId,

        report:
            dirtyReport
    });


    report.dirty = {
        detected:
            true,

        state:
            'DIRTY_TREE',

        commitBlocked:
            true,

        pushBlocked:
            true,

        manualContentPreserved:
            true
    };


    // ========================================================
    // G. REAL MERGE CONFLICT ACCEPTANCE
    // ========================================================

    await createLocalRepository(
        conflictWorkspace,
        'main'
    );


    await writeFile(
        `${conflictWorkspace}/conflict.txt`,
        'base\n',
        'utf8'
    );


    await gitRequired(
        conflictWorkspace,
        [
            'add',
            'conflict.txt'
        ]
    );


    await gitRequired(
        conflictWorkspace,
        [
            'commit',
            '-m',
            'Conflict base'
        ]
    );


    await gitRequired(
        conflictWorkspace,
        [
            'checkout',
            '-b',
            'left'
        ]
    );


    await writeFile(
        `${conflictWorkspace}/conflict.txt`,
        'left branch content\n',
        'utf8'
    );


    await gitRequired(
        conflictWorkspace,
        [
            'add',
            'conflict.txt'
        ]
    );


    await gitRequired(
        conflictWorkspace,
        [
            'commit',
            '-m',
            'Left conflict commit'
        ]
    );


    await gitRequired(
        conflictWorkspace,
        [
            'checkout',
            'main'
        ]
    );


    await gitRequired(
        conflictWorkspace,
        [
            'checkout',
            '-b',
            'right'
        ]
    );


    await writeFile(
        `${conflictWorkspace}/conflict.txt`,
        'right branch content\n',
        'utf8'
    );


    await gitRequired(
        conflictWorkspace,
        [
            'add',
            'conflict.txt'
        ]
    );


    await gitRequired(
        conflictWorkspace,
        [
            'commit',
            '-m',
            'Right conflict commit'
        ]
    );


    const mergeResult =
        await gitResult(
            conflictWorkspace,
            [
                'merge',
                'left'
            ]
        );


    requireCondition(
        mergeResult.code
        !==
        0,

        'EXPECTED_CONFLICTING_MERGE_TO_FAIL'
    );


    const conflictBefore =
        await readFile(
            `${conflictWorkspace}/conflict.txt`,
            'utf8'
        );


    const conflictHashBefore =
        sha256(
            conflictBefore
        );


    const conflictInspection =
        await inspectWorkspaceState(
            conflictWorkspace
        );


    requireCondition(
        conflictInspection.classification.state
        ===
        'MERGE_CONFLICT',

        'MERGE_CONFLICT_NOT_DETECTED'
    );


    requireCondition(
        conflictInspection.classification.decisionRequired
        ===
        true,

        'MERGE_CONFLICT_NOT_DECISION_REQUIRED'
    );


    requireCondition(
        conflictInspection.classification.automaticResolution
        ===
        false,

        'MERGE_CONFLICT_AUTO_RESOLUTION_ENABLED'
    );


    const conflictAfter =
        await readFile(
            `${conflictWorkspace}/conflict.txt`,
            'utf8'
        );


    const conflictHashAfter =
        sha256(
            conflictAfter
        );


    requireCondition(
        conflictHashBefore
        ===
        conflictHashAfter,

        'CONFLICT_INSPECTION_CHANGED_WORKTREE'
    );


    const conflictReport =
        createSafetyReport({
            issueType:
                'MERGE_CONFLICT',

            status:
                'decision_required',

            decisionRequired:
                true,

            localEvidence: {
                state:
                    'MERGE_CONFLICT',

                unmergedPaths:
                    conflictInspection.unmergedPaths,

                conflictHashBefore,

                conflictHashAfter
            },

            remoteEvidence:
                {},

            metadata: {
                acceptance:
                    true,

                automaticConflictResolution:
                    false,

                preserveManualChanges:
                    true
            }
        });


    await persistSafetyReport({
        db,

        reportKey:
            `s06-w06-${stamp}-conflict`,

        projectId,

        report:
            conflictReport
    });


    report.conflict = {
        detected:
            true,

        state:
            'MERGE_CONFLICT',

        decisionRequired:
            true,

        automaticResolution:
            false,

        worktreePreserved:
            true
    };


    // ========================================================
    // H. CREATE REMOTE-B CLONE FROM BASE
    // ========================================================

    await requiredCommand(
        '/usr/bin/git',
        [
            'clone',
            '--branch',
            branchName,
            '--single-branch',
            created.data.ssh_url,
            remoteB
        ],
        {
            cwd:
                fixtureRoot,

            env: {
                GIT_SSH_COMMAND:
                    writeSsh
            }
        },
        'REMOTE_B_CLONE_FAILED'
    );


    await configureRepository(
        remoteB
    );


    // ========================================================
    // I. CREATE LOCAL-A COMMIT
    // ========================================================

    await writeFile(
        `${remoteA}/shared.txt`,
        'local-a change\n',
        'utf8'
    );


    await gitRequired(
        remoteA,
        [
            'add',
            'shared.txt'
        ]
    );


    await gitRequired(
        remoteA,
        [
            'commit',
            '-m',
            'Local A change'
        ]
    );


    const localDivergedSha =
        await gitRequired(
            remoteA,
            [
                'rev-parse',
                'HEAD'
            ]
        );


    // ========================================================
    // J. CREATE REMOTE-B COMMIT + PUSH
    // ========================================================

    await writeFile(
        `${remoteB}/shared.txt`,
        'remote-b change\n',
        'utf8'
    );


    await gitRequired(
        remoteB,
        [
            'add',
            'shared.txt'
        ]
    );


    await gitRequired(
        remoteB,
        [
            'commit',
            '-m',
            'Remote B change'
        ]
    );


    validateAutomatedGitArgs([
        'push',
        'origin',
        `${branchName}:${branchName}`
    ]);


    await gitRequired(
        remoteB,
        [
            'push',
            'origin',
            `${branchName}:${branchName}`
        ],
        {
            GIT_SSH_COMMAND:
                writeSsh
        }
    );


    const remoteDivergedSha =
        await gitRequired(
            remoteB,
            [
                'rev-parse',
                'HEAD'
            ]
        );


    requireCondition(
        localDivergedSha
        !==
        remoteDivergedSha,

        'DIVERGENCE_SHAS_UNEXPECTEDLY_EQUAL'
    );


    // ========================================================
    // K. FETCH + DETECT TRUE REMOTE DIVERGENCE
    // ========================================================

    await gitRequired(
        remoteA,
        [
            'fetch',
            'origin'
        ],
        {
            GIT_SSH_COMMAND:
                writeSsh
        }
    );


    const divergence =
        await inspectRemoteRelation({
            workspacePath:
                remoteA,

            remoteTrackingRef:
                `refs/remotes/origin/${branchName}`
        });


    requireCondition(
        divergence.classification.state
        ===
        'REMOTE_DIVERGED',

        `EXPECTED_REMOTE_DIVERGED:${divergence.classification.state}`
    );


    requireCondition(
        divergence.ahead
        > 0
        &&
        divergence.behind
        > 0,

        'DIVERGENCE_AHEAD_BEHIND_INVALID'
    );


    requireCondition(
        divergence.classification.pushAllowed
        ===
        false,

        'DIVERGED_PUSH_WAS_ALLOWED'
    );


    requireCondition(
        divergence.classification.decisionRequired
        ===
        true,

        'DIVERGENCE_NOT_DECISION_REQUIRED'
    );


    requireCondition(
        divergence.classification.automaticForcePush
        ===
        false,

        'DIVERGENCE_AUTO_FORCE_PUSH_ENABLED'
    );


    const remoteShaBeforeDecision =
        divergence.remoteSha;


    // Deliberately no push / merge / rebase / force-push here.


    const remoteVerifyAfterDecision =
        await gitRequired(
            remoteA,
            [
                'ls-remote',
                'origin',
                `refs/heads/${branchName}`
            ],
            {
                GIT_SSH_COMMAND:
                    writeSsh
            }
        );


    const remoteShaAfterDecision =
        remoteVerifyAfterDecision
            .trim()
            .split(
                /\s+/
            )[0]
            ??
            '';


    requireCondition(
        remoteShaBeforeDecision
        ===
        remoteShaAfterDecision,

        'REMOTE_CHANGED_DURING_DIVERGENCE_DECISION'
    );


    const divergenceReport =
        createSafetyReport({
            issueType:
                'REMOTE_DIVERGED',

            status:
                'decision_required',

            decisionRequired:
                true,

            localEvidence: {
                headSha:
                    divergence.localSha,

                ahead:
                    divergence.ahead
            },

            remoteEvidence: {
                headSha:
                    divergence.remoteSha,

                behind:
                    divergence.behind,

                unchangedAfterDecision:
                    remoteShaBeforeDecision
                    ===
                    remoteShaAfterDecision
            },

            metadata: {
                acceptance:
                    true,

                automaticMerge:
                    false,

                automaticRebase:
                    false,

                automaticForcePush:
                    false
            }
        });


    await persistSafetyReport({
        db,

        reportKey:
            `s06-w06-${stamp}-divergence`,

        projectId,

        report:
            divergenceReport
    });


    report.divergence = {
        detected:
            true,

        state:
            'REMOTE_DIVERGED',

        ahead:
            divergence.ahead,

        behind:
            divergence.behind,

        decisionRequired:
            true,

        pushAttemptedAfterDetection:
            false,

        mergeAttemptedAfterDetection:
            false,

        rebaseAttemptedAfterDetection:
            false,

        forcePushAttempted:
            false,

        remoteUnchanged:
            true
    };


    // ========================================================
    // L. REAL PERMISSION FAILURE USING READ-ONLY DEPLOY KEY
    // ========================================================

    await requiredCommand(
        '/usr/bin/git',
        [
            'clone',
            '--branch',
            branchName,
            '--single-branch',
            created.data.ssh_url,
            permissionWorkspace
        ],
        {
            cwd:
                fixtureRoot,

            env: {
                GIT_SSH_COMMAND:
                    writeSsh
            }
        },
        'PERMISSION_WORKSPACE_CLONE_FAILED'
    );


    await configureRepository(
        permissionWorkspace
    );


    await gitRequired(
        permissionWorkspace,
        [
            'checkout',
            '-b',
            permissionBranch
        ]
    );


    await writeFile(
        `${permissionWorkspace}/permission-test.txt`,
        'read-only deploy key must not push this commit\n',
        'utf8'
    );


    await gitRequired(
        permissionWorkspace,
        [
            'add',
            'permission-test.txt'
        ]
    );


    await gitRequired(
        permissionWorkspace,
        [
            'commit',
            '-m',
            'Permission failure fixture'
        ]
    );


    validateAutomatedGitArgs([
        'push',
        'origin',
        `${permissionBranch}:${permissionBranch}`
    ]);


    const permissionPush =
        await gitResult(
            permissionWorkspace,
            [
                'push',
                'origin',
                `${permissionBranch}:${permissionBranch}`
            ],
            {
                GIT_SSH_COMMAND:
                    readSsh
            }
        );


    requireCondition(
        permissionPush.code
        !==
        0,

        'READ_ONLY_DEPLOY_KEY_PUSH_UNEXPECTEDLY_SUCCEEDED'
    );


    const permissionClassification =
        classifyPushFailure({
            stderr:
                permissionPush.stderr,

            exitCode:
                permissionPush.code
        });


    requireCondition(
        permissionClassification.issueType
        ===
        'PERMISSION_DENIED',

        `PERMISSION_FAILURE_MISCLASSIFIED:${permissionClassification.issueType}`
    );


    requireCondition(
        permissionClassification.retryAction
        ===
        'REQUIRE_PERMISSION_FIX',

        'PERMISSION_RETRY_ACTION_INVALID'
    );


    requireCondition(
        permissionClassification.rerunImplementation
        ===
        false,

        'PERMISSION_FAILURE_RERUNS_IMPLEMENTATION'
    );


    requireCondition(
        permissionClassification.recreateCommit
        ===
        false,

        'PERMISSION_FAILURE_RECREATES_COMMIT'
    );


    requireCondition(
        permissionClassification.automaticForcePush
        ===
        false,

        'PERMISSION_FAILURE_ENABLES_FORCE_PUSH'
    );


    const permissionRemoteCheck =
        await gitRequired(
            permissionWorkspace,
            [
                'ls-remote',
                'origin',
                `refs/heads/${permissionBranch}`
            ],
            {
                GIT_SSH_COMMAND:
                    writeSsh
            }
        );


    requireCondition(
        permissionRemoteCheck.trim()
        ===
        '',

        'FAILED_PERMISSION_PUSH_CREATED_REMOTE_BRANCH'
    );


    const permissionReport =
        createSafetyReport({
            issueType:
                'PERMISSION_DENIED',

            status:
                'decision_required',

            decisionRequired:
                true,

            localEvidence: {
                branch:
                    permissionBranch,

                localCommitPreserved:
                    true,

                exitCode:
                    permissionPush.code
            },

            remoteEvidence: {
                branchCreated:
                    false,

                permission:
                    'denied'
            },

            metadata: {
                acceptance:
                    true,

                retryAction:
                    'REQUIRE_PERMISSION_FIX',

                rerunImplementation:
                    false,

                recreateCommit:
                    false,

                automaticForcePush:
                    false
            }
        });


    await persistSafetyReport({
        db,

        reportKey:
            `s06-w06-${stamp}-permission`,

        projectId,

        report:
            permissionReport
    });


    report.permission = {
        actualReadOnlyDeployKey:
            true,

        pushFailed:
            true,

        classified:
            'PERMISSION_DENIED',

        retryAction:
            'REQUIRE_PERMISSION_FIX',

        rerunImplementation:
            false,

        recreateCommit:
            false,

        forcePush:
            false,

        remoteBranchCreated:
            false
    };


    // ========================================================
    // M. VERIFY FOUR DURABLE SAFETY REPORTS
    // ========================================================

    const reportsResult =
        await db.query(
            `
            SELECT
                issue_type,
                status,
                decision_required,
                preserves_manual_changes,
                automatic_force_push,
                local_evidence,
                remote_evidence
            FROM git_safety_reports
            WHERE
                project_id=$1
                AND report_key LIKE $2
            ORDER BY issue_type
            `,
            [
                projectId,
                `s06-w06-${stamp}-%`
            ]
        );


    requireCondition(
        reportsResult.rowCount
        ===
        4,

        `EXPECTED_FOUR_SAFETY_REPORTS:${reportsResult.rowCount}`
    );


    const issueTypes =
        reportsResult.rows
            .map(
                row =>
                    row.issue_type
            )
            .sort();


    const expectedIssues =
        [
            'DIRTY_TREE',
            'MERGE_CONFLICT',
            'PERMISSION_DENIED',
            'REMOTE_DIVERGED'
        ].sort();


    requireCondition(
        JSON.stringify(
            issueTypes
        )
        ===
        JSON.stringify(
            expectedIssues
        ),

        `SAFETY_REPORT_ISSUE_SET_INVALID:${issueTypes.join(',')}`
    );


    requireCondition(
        reportsResult.rows.every(
            row =>
                row.decision_required
                ===
                true
        ),

        'SAFETY_REPORT_DECISION_REQUIRED_INVALID'
    );


    requireCondition(
        reportsResult.rows.every(
            row =>
                row.preserves_manual_changes
                ===
                true
        ),

        'SAFETY_REPORT_MANUAL_CHANGE_POLICY_INVALID'
    );


    requireCondition(
        reportsResult.rows.every(
            row =>
                row.automatic_force_push
                ===
                false
        ),

        'SAFETY_REPORT_FORCE_PUSH_POLICY_INVALID'
    );


    const divergenceRow =
        reportsResult.rows.find(
            row =>
                row.issue_type
                ===
                'REMOTE_DIVERGED'
        );


    requireCondition(
        divergenceRow?.local_evidence?.headSha
        &&
        divergenceRow?.remote_evidence?.headSha,

        'DIVERGENCE_LOCAL_REMOTE_EVIDENCE_MISSING'
    );


    requireCondition(
        divergenceRow.local_evidence.headSha
        !==
        divergenceRow.remote_evidence.headSha,

        'DIVERGENCE_EVIDENCE_SHAS_NOT_SEPARATE'
    );


    report.database = {
        safetyReports:
            4,

        exactIssueSet:
            true,

        allDecisionRequired:
            true,

        allPreserveManualChanges:
            true,

        automaticForcePushReports:
            0,

        localRemoteEvidenceSeparated:
            true
    };


} catch (
    error
) {

    mainError =
        error;

} finally {

    const cleanupErrors = [];


    // ========================================================
    // CLEANUP DATABASE PROJECT
    // ========================================================

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


    // ========================================================
    // CLEANUP GITHUB REPOSITORY
    // ========================================================

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


    // ========================================================
    // CLEANUP WORKSPACES
    // ========================================================

    try {

        if (
            fixtureRoot.startsWith(
                `${workspaceRoot}/s06-w06-`
            )
        ) {

            await rm(
                fixtureRoot,
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


    // ========================================================
    // CLEANUP DEPLOY KEYS
    // ========================================================

    try {

        if (
            keyRoot.startsWith(
                `${acceptanceRoot}/s06-w06-`
            )
        ) {

            await rm(
                keyRoot,
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


    // ========================================================
    // VERIFY DATABASE CLEANUP
    // ========================================================

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


    // ========================================================
    // VERIFY GITHUB CLEANUP
    // ========================================================

    let repositoryDeleted =
        true;


    try {

        const lookup =
            await getRepository(
                secretRef,
                owner,
                repositoryName
            );


        repositoryDeleted =
            lookup.status
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

        hooks:
            report.hooks,

        dirty:
            report.dirty,

        conflict:
            report.conflict,

        divergence:
            report.divergence,

        permission:
            report.permission,

        database:
            report.database,

        cleanup:
            report.cleanup
    })
);

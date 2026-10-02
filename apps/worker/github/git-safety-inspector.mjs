import {
    spawn
} from 'node:child_process';

import {
    resolve
} from 'node:path';

import {
    classifyWorkspaceState,
    classifyRemoteRelation,
    verifyHooksIsolation,
    buildGitSafetyReport
} from './git-safety-policy.mjs';


function runCommand(
    executable,
    args,
    {
        cwd,
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


async function requiredGit(
    workspace,
    args,
    errorCode
) {

    const result =
        await runCommand(
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

        throw new Error(
            `${errorCode}:${result.code}`
        );

    }


    return result.stdout.trim();

}


export async function inspectWorkspaceState(
    workspacePath
) {

    const workspace =
        resolve(
            String(
                workspacePath
            )
        );


    const gitRoot =
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
            gitRoot
        )
        !==
        workspace
    ) {

        throw new Error(
            'WORKSPACE_ROOT_MISMATCH'
        );

    }


    const status =
        await requiredGit(
            workspace,
            [
                'status',
                '--porcelain=v1',
                '--untracked-files=all'
            ],
            'GIT_STATUS_FAILED'
        );


    const unmergedText =
        await requiredGit(
            workspace,
            [
                'diff',
                '--name-only',
                '--diff-filter=U'
            ],
            'UNMERGED_PATH_QUERY_FAILED'
        );


    const unmergedPaths =
        unmergedText
            ? unmergedText
                .split(
                    /\r?\n/
                )
                .filter(
                    Boolean
                )
            : [];


    const classification =
        classifyWorkspaceState({
            statusPorcelain:
                status,

            unmergedPaths
        });


    return {
        workspacePath:
            workspace,

        statusPorcelain:
            status,

        unmergedPaths,

        classification
    };

}


export async function inspectRemoteRelation({

    workspacePath,
    remoteTrackingRef

}) {

    const workspace =
        resolve(
            String(
                workspacePath
            )
        );


    const remoteRef =
        String(
            remoteTrackingRef
            ??
            ''
        ).trim();


    if (!remoteRef) {

        throw new Error(
            'REMOTE_TRACKING_REF_REQUIRED'
        );

    }


    const countOutput =
        await requiredGit(
            workspace,
            [
                'rev-list',
                '--left-right',
                '--count',
                `HEAD...${remoteRef}`
            ],
            'AHEAD_BEHIND_QUERY_FAILED'
        );


    const parts =
        countOutput
            .trim()
            .split(
                /\s+/
            );


    if (
        parts.length
        !==
        2
    ) {

        throw new Error(
            'AHEAD_BEHIND_OUTPUT_INVALID'
        );

    }


    const ahead =
        Number(
            parts[0]
        );


    const behind =
        Number(
            parts[1]
        );


    const localSha =
        await requiredGit(
            workspace,
            [
                'rev-parse',
                'HEAD'
            ],
            'LOCAL_SHA_QUERY_FAILED'
        );


    const remoteSha =
        await requiredGit(
            workspace,
            [
                'rev-parse',
                remoteRef
            ],
            'REMOTE_SHA_QUERY_FAILED'
        );


    const classification =
        classifyRemoteRelation({
            ahead,
            behind
        });


    return {
        workspacePath:
            workspace,

        remoteTrackingRef:
            remoteRef,

        ahead,
        behind,

        localSha,
        remoteSha,

        classification
    };

}


export async function inspectHooksIsolation({

    workspacePath,
    expectedHooksPath

}) {

    const workspace =
        resolve(
            String(
                workspacePath
            )
        );


    const configured =
        await requiredGit(
            workspace,
            [
                'config',
                '--get',
                'core.hooksPath'
            ],
            'HOOKS_PATH_QUERY_FAILED'
        );


    const verification =
        verifyHooksIsolation({
            configuredHooksPath:
                configured,

            expectedHooksPath:
                expectedHooksPath
        });


    return {
        configuredHooksPath:
            configured,

        expectedHooksPath,

        verification
    };

}


export async function persistSafetyReport({

    db,
    reportKey,
    projectId,
    report

}) {

    const result =
        await db.query(
            `
            INSERT INTO git_safety_reports (
                report_key,
                project_id,
                issue_type,
                status,
                decision_required,
                preserves_manual_changes,
                automatic_force_push,
                untrusted_hooks_disabled,
                local_evidence,
                remote_evidence,
                metadata
            )
            VALUES (
                $1::text,
                $2::uuid,
                $3::text,
                $4::text,
                $5::boolean,
                $6::boolean,
                $7::boolean,
                $8::boolean,
                $9::jsonb,
                $10::jsonb,
                $11::jsonb
            )
            RETURNING *
            `,
            [
                reportKey,

                projectId,

                report.issueType,

                report.status,

                report.decisionRequired
                ===
                true,

                report.preservesManualChanges
                ===
                true,

                report.automaticForcePush
                ===
                true,

                report.untrustedHooksDisabled
                ===
                true,

                JSON.stringify(
                    report.localEvidence
                    ??
                    {}
                ),

                JSON.stringify(
                    report.remoteEvidence
                    ??
                    {}
                ),

                JSON.stringify(
                    report.metadata
                    ??
                    {}
                )
            ]
        );


    if (
        result.rowCount
        !==
        1
    ) {

        throw new Error(
            'SAFETY_REPORT_PERSISTENCE_FAILED'
        );

    }


    return result.rows[0];

}


export function createSafetyReport(
    input
) {

    return buildGitSafetyReport(
        input
    );

}

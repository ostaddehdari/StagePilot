import {
    readFile
} from 'node:fs/promises';

import {
    spawn
} from 'node:child_process';

import {
    fileURLToPath
} from 'node:url';

import {
    assertCredentialFreeEvidence,
    ensureWorkspaceInsideRoot,
    preflightSshTarget,
    sanitizeSshProfileForEvidence,
    validateSshProfile
} from './ssh-preflight-policy.mjs';


function runProcess(
    executable,
    args,
    {
        stdin = '',
        cwd = '/',
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

                            ...env
                        },

                        stdio: [
                            'pipe',
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


            if (
                stdin
            ) {

                child.stdin.write(
                    stdin
                );

            }


            child.stdin.end();

        }
    );

}


function fileRefPath(
    value
) {

    const text =
        String(
            value
            ??
            ''
        );


    if (
        !text.startsWith(
            'file://'
        )
    ) {

        throw new Error(
            'SSH_FILE_REFERENCE_REQUIRED'
        );

    }


    return fileURLToPath(
        text
    );

}


function blocked(
    errorCode,
    counters,
    details = {}
) {

    return {
        passed:
            false,

        executionStarted:
            false,

        errorCode,

        counters: {
            ...counters
        },

        details
    };

}


export function validateRequestedTarget({

    profile,
    request

}) {

    const normalized =
        validateSshProfile(
            profile
        );


    if (
        String(
            request?.hostname
            ??
            ''
        ).toLowerCase()
        !==
        normalized.hostname
    ) {

        return {
            passed:
                false,

            errorCode:
                'SSH_HOST_MISMATCH'
        };

    }


    if (
        Number(
            request?.port
        )
        !==
        normalized.port
    ) {

        return {
            passed:
                false,

            errorCode:
                'SSH_PORT_MISMATCH'
        };

    }


    if (
        String(
            request?.username
            ??
            ''
        )
        !==
        normalized.username
    ) {

        return {
            passed:
                false,

            errorCode:
                'SSH_USERNAME_MISMATCH'
        };

    }


    try {

        ensureWorkspaceInsideRoot({
            allowedRoot:
                normalized.allowedWorkspaceRoot,

            workspacePath:
                request?.workspacePath
        });

    } catch (
        error
    ) {

        return {
            passed:
                false,

            errorCode:
                error.message
        };

    }


    return {
        passed:
            true,

        errorCode:
            null
    };

}


export async function verifyPinnedKnownHost(
    profile
) {

    const normalized =
        validateSshProfile(
            profile
        );


    const knownHostsPath =
        fileRefPath(
            normalized.knownHostsRef
        );


    // Ensure the file is readable before invoking ssh-keygen.
    await readFile(
        knownHostsPath,
        'utf8'
    );


    const result =
        await runProcess(
            '/usr/bin/ssh-keygen',
            [
                '-lf',
                knownHostsPath,
                '-E',
                'sha256'
            ]
        );


    if (
        result.code
        !==
        0
    ) {

        return {
            verified:
                false,

            errorCode:
                'SSH_KNOWN_HOSTS_UNREADABLE'
        };

    }


    const fingerprints =
        result.stdout
            .split(
                /\r?\n/
            )
            .map(
                line =>
                    line.trim()
            )
            .filter(
                Boolean
            )
            .map(
                line =>
                    line
                        .split(
                            /\s+/
                        )[
                            1
                        ]
            )
            .filter(
                Boolean
            );


    if (
        !fingerprints.includes(
            normalized.hostKeyFingerprint
        )
    ) {

        return {
            verified:
                false,

            errorCode:
                'SSH_PINNED_HOST_KEY_MISMATCH'
        };

    }


    return {
        verified:
            true,

        errorCode:
            null,

        fingerprint:
            normalized.hostKeyFingerprint
    };

}


function sshArguments(
    profile,
    workspacePath
) {

    const normalized =
        validateSshProfile(
            profile
        );


    const identityPath =
        fileRefPath(
            normalized.identityRef
        );


    const knownHostsPath =
        fileRefPath(
            normalized.knownHostsRef
        );


    return [
        '-i',
        identityPath,

        '-o',
        'IdentitiesOnly=yes',

        '-o',
        'BatchMode=yes',

        '-o',
        'PasswordAuthentication=no',

        '-o',
        'KbdInteractiveAuthentication=no',

        '-o',
        'StrictHostKeyChecking=yes',

        '-o',
        `UserKnownHostsFile=${knownHostsPath}`,

        '-o',
        'ConnectTimeout=10',

        '-p',
        String(
            normalized.port
        ),

        `${normalized.username}@${normalized.hostname}`,

        '/bin/bash',
        '-s',
        '--',
        workspacePath
    ];

}


async function runSshScript({

    profile,
    workspacePath,
    script,
    counters,
    projectCommand = false

}) {

    counters.transportCalls +=
        1;


    if (
        projectCommand
    ) {

        counters.projectCommandCalls +=
            1;

    } else {

        counters.probeCalls +=
            1;

    }


    return runProcess(
        '/usr/bin/ssh',
        sshArguments(
            profile,
            workspacePath
        ),
        {
            stdin:
                script
        }
    );

}


function parseProbe(
    stdout
) {

    const values = {};


    for (
        const line
        of String(
            stdout
            ??
            ''
        ).split(
            /\r?\n/
        )
    ) {

        const index =
            line.indexOf(
                '='
            );


        if (
            index
            <=
            0
        ) {

            continue;

        }


        values[
            line.slice(
                0,
                index
            )
        ] =
            line.slice(
                index
                +
                1
            );

    }


    return values;

}


const PROBE_SCRIPT = String.raw`set -Eeuo pipefail
workspace="$1"
cd -- "$workspace"

printf 'USER=%s\n' "$(id -un)"
printf 'REMOTE_HOSTNAME=%s\n' "$(hostname)"
printf 'WORKSPACE=%s\n' "$(pwd -P)"
printf 'BRANCH=%s\n' "$(git branch --show-current)"
printf 'SHA=%s\n' "$(git rev-parse HEAD)"
printf 'DISK_MB=%s\n' "$(df -Pm . | awk 'NR==2 {print $4}')"
printf 'MEMORY_MB=%s\n' "$(awk '/MemAvailable:/ {printf "%.0f\n", $2/1024}' /proc/meminfo)"
printf 'LOAD1=%s\n' "$(awk '{print $1}' /proc/loadavg)"
`;


export async function persistPreflightReceipt({

    db,
    receiptKey,
    projectId,
    profileId,
    workspacePath,
    expectedCodeSha,
    expectedBranch,
    result

}) {

    const hostEvidence =
        result.hostEvidence
        ??
        {};


    const codeEvidence =
        result.codeEvidence
        ??
        {};


    const resourceEvidence =
        result.resourceEvidence
        ??
        {};


    const safeEvidence = {
        credentialsRedacted:
            true,

        transportCalls:
            result.counters?.transportCalls
            ??
            0,

        probeCalls:
            result.counters?.probeCalls
            ??
            0,

        projectCommandCalls:
            result.counters?.projectCommandCalls
            ??
            0,

        executionStarted:
            result.executionStarted
            ===
            true
    };


    assertCredentialFreeEvidence(
        hostEvidence
    );


    assertCredentialFreeEvidence(
        codeEvidence
    );


    assertCredentialFreeEvidence(
        resourceEvidence
    );


    assertCredentialFreeEvidence(
        safeEvidence
    );


    const insert =
        await db.query(
            `
            INSERT INTO ssh_preflight_receipts (
                receipt_key,
                project_id,
                profile_id,
                workspace_path,
                expected_code_sha,
                observed_code_sha,
                expected_branch,
                observed_branch,
                status,
                error_code,
                host_evidence,
                code_evidence,
                resource_evidence,
                safe_evidence
            )
            VALUES (
                $1::text,
                $2::uuid,
                $3::uuid,
                $4::text,
                $5::text,
                $6::text,
                $7::text,
                $8::text,
                $9::text,
                $10::text,
                $11::jsonb,
                $12::jsonb,
                $13::jsonb,
                $14::jsonb
            )
            RETURNING *
            `,
            [
                receiptKey,

                projectId,

                profileId,

                workspacePath,

                expectedCodeSha,

                result.observedCodeSha
                ??
                null,

                expectedBranch,

                result.observedBranch
                ??
                null,

                result.passed
                    ? 'passed'
                    : 'blocked',

                result.errorCode
                ??
                null,

                JSON.stringify(
                    hostEvidence
                ),

                JSON.stringify(
                    codeEvidence
                ),

                JSON.stringify(
                    resourceEvidence
                ),

                JSON.stringify(
                    safeEvidence
                )
            ]
        );


    if (
        insert.rowCount
        !==
        1
    ) {

        throw new Error(
            'SSH_PREFLIGHT_RECEIPT_PERSIST_FAILED'
        );

    }


    return insert.rows[0];

}


export async function executeAfterSshPreflight({

    db,
    receiptKey,
    projectId,
    profileId,
    profile,
    request,
    expectedCodeSha,
    projectScript = null

}) {

    const normalized =
        validateSshProfile(
            profile
        );


    const counters = {
        transportCalls:
            0,

        probeCalls:
            0,

        projectCommandCalls:
            0
    };


    const localTarget =
        validateRequestedTarget({
            profile:
                normalized,

            request
        });


    if (
        localTarget.passed
        !==
        true
    ) {

        const result =
            blocked(
                localTarget.errorCode,
                counters
            );


        result.hostEvidence = {
            targetValidatedLocally:
                false
        };


        result.codeEvidence = {};
        result.resourceEvidence = {};


        await persistPreflightReceipt({
            db,
            receiptKey,
            projectId,
            profileId,
            workspacePath:
                request.workspacePath,
            expectedCodeSha,
            expectedBranch:
                normalized.expectedBranch,
            result
        });


        return result;

    }


    const pinned =
        await verifyPinnedKnownHost(
            normalized
        );


    if (
        pinned.verified
        !==
        true
    ) {

        const result =
            blocked(
                pinned.errorCode,
                counters
            );


        result.hostEvidence = {
            hostKeyVerified:
                false
        };


        result.codeEvidence = {};
        result.resourceEvidence = {};


        await persistPreflightReceipt({
            db,
            receiptKey,
            projectId,
            profileId,
            workspacePath:
                request.workspacePath,
            expectedCodeSha,
            expectedBranch:
                normalized.expectedBranch,
            result
        });


        return result;

    }


    const probe =
        await runSshScript({
            profile:
                normalized,

            workspacePath:
                request.workspacePath,

            script:
                PROBE_SCRIPT,

            counters,

            projectCommand:
                false
        });


    if (
        probe.code
        !==
        0
    ) {

        const result =
            blocked(
                'SSH_PROBE_FAILED',
                counters
            );


        result.hostEvidence = {
            hostKeyVerified:
                true,

            probeExitCode:
                probe.code
        };


        result.codeEvidence = {};
        result.resourceEvidence = {};


        await persistPreflightReceipt({
            db,
            receiptKey,
            projectId,
            profileId,
            workspacePath:
                request.workspacePath,
            expectedCodeSha,
            expectedBranch:
                normalized.expectedBranch,
            result
        });


        return result;

    }


    const observed =
        parseProbe(
            probe.stdout
        );


    const preflight =
        preflightSshTarget({
            profile:
                normalized,

            expectedCodeSha,

            observed: {
                hostname:
                    request.hostname,

                port:
                    request.port,

                username:
                    observed.USER,

                hostKeyType:
                    normalized.hostKeyType,

                hostKeyFingerprint:
                    pinned.fingerprint,

                workspacePath:
                    observed.WORKSPACE,

                branchName:
                    observed.BRANCH,

                codeSha:
                    observed.SHA,

                resources: {
                    freeDiskMb:
                        Number(
                            observed.DISK_MB
                        ),

                    freeMemoryMb:
                        Number(
                            observed.MEMORY_MB
                        ),

                    load1:
                        Number(
                            observed.LOAD1
                        )
                }
            }
        });


    const baseResult = {
        passed:
            preflight.passed
            ===
            true,

        executionStarted:
            false,

        errorCode:
            preflight.errorCode
            ??
            null,

        counters,

        observedCodeSha:
            observed.SHA
            ??
            null,

        observedBranch:
            observed.BRANCH
            ??
            null,

        hostEvidence: {
            targetValidatedLocally:
                true,

            hostKeyVerified:
                true,

            hostname:
                normalized.hostname,

            port:
                normalized.port,

            username:
                observed.USER,

            remoteHostname:
                observed.REMOTE_HOSTNAME,

            hostKeyType:
                normalized.hostKeyType,

            hostKeyFingerprint:
                normalized.hostKeyFingerprint
        },

        codeEvidence: {
            workspace:
                observed.WORKSPACE,

            expectedBranch:
                normalized.expectedBranch,

            observedBranch:
                observed.BRANCH,

            expectedCodeSha,

            observedCodeSha:
                observed.SHA
        },

        resourceEvidence: {
            freeDiskMb:
                Number(
                    observed.DISK_MB
                ),

            freeMemoryMb:
                Number(
                    observed.MEMORY_MB
                ),

            load1:
                Number(
                    observed.LOAD1
                )
        }
    };


    if (
        preflight.passed
        !==
        true
    ) {

        await persistPreflightReceipt({
            db,
            receiptKey,
            projectId,
            profileId,
            workspacePath:
                request.workspacePath,
            expectedCodeSha,
            expectedBranch:
                normalized.expectedBranch,
            result:
                baseResult
        });


        return baseResult;

    }


    if (
        projectScript
        ===
        null
    ) {

        await persistPreflightReceipt({
            db,
            receiptKey,
            projectId,
            profileId,
            workspacePath:
                request.workspacePath,
            expectedCodeSha,
            expectedBranch:
                normalized.expectedBranch,
            result:
                baseResult
        });


        return baseResult;

    }


    const projectCommand =
        await runSshScript({
            profile:
                normalized,

            workspacePath:
                request.workspacePath,

            script:
                projectScript,

            counters,

            projectCommand:
                true
        });


    if (
        projectCommand.code
        !==
        0
    ) {

        throw new Error(
            `SSH_PROJECT_COMMAND_FAILED:${projectCommand.code}`
        );

    }


    baseResult.executionStarted =
        true;


    baseResult.projectCommand = {
        exitCode:
            0
    };


    await persistPreflightReceipt({
        db,
        receiptKey,
        projectId,
        profileId,
        workspacePath:
            request.workspacePath,
        expectedCodeSha,
        expectedBranch:
            normalized.expectedBranch,
        result:
            baseResult
    });


    return baseResult;

}


export function safeProfileEvidence(
    profile
) {

    return sanitizeSshProfileForEvidence(
        profile
    );

}

import {
    access,
    rm
} from 'node:fs/promises';

import {
    constants as fsConstants
} from 'node:fs';

import {
    Pool
} from 'pg';

import {
    executeAfterSshPreflight,
    safeProfileEvidence
} from './ssh-live-preflight.mjs';

import {
    assertCredentialFreeEvidence
} from './ssh-preflight-policy.mjs';


const projectId =
    process.env.STAGEPILOT_PROJECT_ID;


const profileId =
    process.env.STAGEPILOT_PROFILE_ID;


const hostname =
    process.env.STAGEPILOT_SSH_HOST;


const port =
    Number(
        process.env.STAGEPILOT_SSH_PORT
    );


const username =
    process.env.STAGEPILOT_SSH_USER;


const fingerprint =
    process.env.STAGEPILOT_SSH_FINGERPRINT;


const knownHostsRef =
    process.env.STAGEPILOT_SSH_KNOWN_HOSTS_REF;


const identityRef =
    process.env.STAGEPILOT_SSH_IDENTITY_REF;


const workspaceRoot =
    process.env.STAGEPILOT_WORKSPACE_ROOT;


const goodWorkspace =
    process.env.STAGEPILOT_GOOD_WORKSPACE;


const wrongBranchWorkspace =
    process.env.STAGEPILOT_WRONG_BRANCH_WORKSPACE;


const goodSha =
    process.env.STAGEPILOT_GOOD_SHA;


const serverKey =
    process.env.STAGEPILOT_SERVER_KEY;


if (
    process.env.STAGEPILOT_W03B_ACCEPTANCE
    !==
    '1'
) {

    throw new Error(
        'ACCEPTANCE_NOT_ENABLED'
    );

}


const required = [
    projectId,
    profileId,
    hostname,
    username,
    fingerprint,
    knownHostsRef,
    identityRef,
    workspaceRoot,
    goodWorkspace,
    wrongBranchWorkspace,
    goodSha,
    serverKey
];


if (
    required.some(
        value =>
            !value
    )
    ||
    !Number.isInteger(
        port
    )
) {

    throw new Error(
        'ACCEPTANCE_CONFIGURATION_MISSING'
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


const stamp =
    `${Date.now()}-${process.pid}`;


const profile = {
    profileKey:
        'stagepilot-local-runner-main',

    serverKey,

    hostLabel:
        'StagePilot Local Restricted Runner',

    hostname,

    port,

    username,

    hostKeyType:
        'ssh-ed25519',

    hostKeyFingerprint:
        fingerprint,

    knownHostsRef,

    identityRef,

    allowedWorkspaceRoot:
        workspaceRoot,

    expectedBranch:
        'main',

    resources: {
        minFreeDiskMb:
            100,

        minFreeMemoryMb:
            128,

        maxLoad1:
            1000
    }
};


const report = {
    profile: {},
    good: {},
    wrongHost: {},
    wrongWorkspace: {},
    wrongBranch: {},
    wrongSha: {},
    wrongFingerprint: {},
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


async function exists(
    path
) {

    try {

        await access(
            path,
            fsConstants.F_OK
        );

        return true;

    } catch {

        return false;

    }

}


function projectMarkerScript(
    markerName
) {

    return `set -Eeuo pipefail
workspace="$1"
cd -- "$workspace"
printf 'EXECUTED\\n' > "${markerName}"
`;

}


let mainError =
    null;


try {

    // ========================================================
    // A. PROFILE EVIDENCE MUST CONTAIN NO CREDENTIAL REFS
    // ========================================================

    const safeProfile =
        safeProfileEvidence(
            profile
        );


    requireCondition(
        safeProfile.identityRef
        ===
        undefined,

        'IDENTITY_REF_EXPOSED_IN_SAFE_PROFILE'
    );


    requireCondition(
        safeProfile.knownHostsRef
        ===
        undefined,

        'KNOWN_HOSTS_REF_EXPOSED_IN_SAFE_PROFILE'
    );


    requireCondition(
        assertCredentialFreeEvidence(
            safeProfile
        )
        ===
        true,

        'SAFE_PROFILE_EVIDENCE_REJECTED'
    );


    report.profile = {
        credentialReferencesExposed:
            false,

        credentialsRedacted:
            true
    };


    // ========================================================
    // B. VALID REAL SSH PREFLIGHT + PROJECT COMMAND
    // ========================================================

    const goodMarker =
        '.w03-good-executed';


    await rm(
        `${goodWorkspace}/${goodMarker}`,
        {
            force:
                true
        }
    );


    const good =
        await executeAfterSshPreflight({
            db:
                pool,

            receiptKey:
                `s07-w03b-good-${stamp}`,

            projectId,

            profileId,

            profile,

            request: {
                hostname,
                port,
                username,
                workspacePath:
                    goodWorkspace
            },

            expectedCodeSha:
                goodSha,

            projectScript:
                projectMarkerScript(
                    goodMarker
                )
        });


    requireCondition(
        good.passed
        ===
        true,

        `GOOD_PREFLIGHT_FAILED:${good.errorCode}`
    );


    requireCondition(
        good.executionStarted
        ===
        true,

        'GOOD_PROJECT_COMMAND_NOT_STARTED'
    );


    requireCondition(
        good.counters.transportCalls
        ===
        2,

        'GOOD_TRANSPORT_CALL_COUNT_INVALID'
    );


    requireCondition(
        good.counters.probeCalls
        ===
        1,

        'GOOD_PROBE_CALL_COUNT_INVALID'
    );


    requireCondition(
        good.counters.projectCommandCalls
        ===
        1,

        'GOOD_PROJECT_COMMAND_COUNT_INVALID'
    );


    requireCondition(
        await exists(
            `${goodWorkspace}/${goodMarker}`
        ),

        'GOOD_EXECUTION_MARKER_MISSING'
    );


    report.good = {
        passed:
            true,

        transportCalls:
            good.counters.transportCalls,

        probeCalls:
            good.counters.probeCalls,

        projectCommandCalls:
            good.counters.projectCommandCalls,

        markerCreated:
            true
    };


    // ========================================================
    // C. WRONG HOST: ZERO SSH TRANSPORT
    // ========================================================

    const wrongHostMarker =
        '.w03-wrong-host-executed';


    await rm(
        `${goodWorkspace}/${wrongHostMarker}`,
        {
            force:
                true
        }
    );


    const wrongHost =
        await executeAfterSshPreflight({
            db:
                pool,

            receiptKey:
                `s07-w03b-wrong-host-${stamp}`,

            projectId,

            profileId,

            profile,

            request: {
                hostname:
                    '127.0.0.2',

                port,

                username,

                workspacePath:
                    goodWorkspace
            },

            expectedCodeSha:
                goodSha,

            projectScript:
                projectMarkerScript(
                    wrongHostMarker
                )
        });


    requireCondition(
        wrongHost.passed
        ===
        false
        &&
        wrongHost.errorCode
        ===
        'SSH_HOST_MISMATCH',

        'WRONG_HOST_NOT_BLOCKED'
    );


    requireCondition(
        wrongHost.counters.transportCalls
        ===
        0,

        'WRONG_HOST_OPENED_TRANSPORT'
    );


    requireCondition(
        wrongHost.counters.projectCommandCalls
        ===
        0,

        'WRONG_HOST_EXECUTED_PROJECT_COMMAND'
    );


    requireCondition(
        !await exists(
            `${goodWorkspace}/${wrongHostMarker}`
        ),

        'WRONG_HOST_MARKER_CREATED'
    );


    report.wrongHost = {
        blocked:
            true,

        errorCode:
            wrongHost.errorCode,

        transportCalls:
            0,

        projectCommandCalls:
            0
    };


    // ========================================================
    // D. WRONG WORKSPACE: ZERO SSH TRANSPORT
    // ========================================================

    const outsideWorkspace =
        '/tmp/stagepilot-w03-outside-workspace';


    const wrongWorkspace =
        await executeAfterSshPreflight({
            db:
                pool,

            receiptKey:
                `s07-w03b-wrong-workspace-${stamp}`,

            projectId,

            profileId,

            profile,

            request: {
                hostname,
                port,
                username,
                workspacePath:
                    outsideWorkspace
            },

            expectedCodeSha:
                goodSha,

            projectScript:
                projectMarkerScript(
                    '.must-not-execute'
                )
        });


    requireCondition(
        wrongWorkspace.passed
        ===
        false
        &&
        wrongWorkspace.errorCode
        ===
        'SSH_WORKSPACE_OUTSIDE_ALLOWED_ROOT',

        'WRONG_WORKSPACE_NOT_BLOCKED'
    );


    requireCondition(
        wrongWorkspace.counters.transportCalls
        ===
        0,

        'WRONG_WORKSPACE_OPENED_TRANSPORT'
    );


    requireCondition(
        wrongWorkspace.counters.projectCommandCalls
        ===
        0,

        'WRONG_WORKSPACE_EXECUTED_PROJECT_COMMAND'
    );


    report.wrongWorkspace = {
        blocked:
            true,

        errorCode:
            wrongWorkspace.errorCode,

        transportCalls:
            0,

        projectCommandCalls:
            0
    };


    // ========================================================
    // E. WRONG BRANCH: PROBE ONLY, ZERO PROJECT COMMAND
    // ========================================================

    const wrongBranchMarker =
        '.w03-wrong-branch-executed';


    await rm(
        `${wrongBranchWorkspace}/${wrongBranchMarker}`,
        {
            force:
                true
        }
    );


    const wrongBranch =
        await executeAfterSshPreflight({
            db:
                pool,

            receiptKey:
                `s07-w03b-wrong-branch-${stamp}`,

            projectId,

            profileId,

            profile,

            request: {
                hostname,
                port,
                username,
                workspacePath:
                    wrongBranchWorkspace
            },

            expectedCodeSha:
                goodSha,

            projectScript:
                projectMarkerScript(
                    wrongBranchMarker
                )
        });


    requireCondition(
        wrongBranch.passed
        ===
        false
        &&
        wrongBranch.errorCode
        ===
        'SSH_BRANCH_MISMATCH',

        `WRONG_BRANCH_NOT_BLOCKED:${wrongBranch.errorCode}`
    );


    requireCondition(
        wrongBranch.counters.probeCalls
        ===
        1,

        'WRONG_BRANCH_PROBE_NOT_RUN'
    );


    requireCondition(
        wrongBranch.counters.projectCommandCalls
        ===
        0,

        'WRONG_BRANCH_EXECUTED_PROJECT_COMMAND'
    );


    requireCondition(
        !await exists(
            `${wrongBranchWorkspace}/${wrongBranchMarker}`
        ),

        'WRONG_BRANCH_MARKER_CREATED'
    );


    report.wrongBranch = {
        blocked:
            true,

        errorCode:
            wrongBranch.errorCode,

        probeCalls:
            1,

        projectCommandCalls:
            0
    };


    // ========================================================
    // F. WRONG CODE SHA: PROBE ONLY, ZERO PROJECT COMMAND
    // ========================================================

    const wrongShaMarker =
        '.w03-wrong-sha-executed';


    await rm(
        `${goodWorkspace}/${wrongShaMarker}`,
        {
            force:
                true
        }
    );


    const wrongSha =
        await executeAfterSshPreflight({
            db:
                pool,

            receiptKey:
                `s07-w03b-wrong-sha-${stamp}`,

            projectId,

            profileId,

            profile,

            request: {
                hostname,
                port,
                username,
                workspacePath:
                    goodWorkspace
            },

            expectedCodeSha:
                'f'.repeat(
                    40
                ),

            projectScript:
                projectMarkerScript(
                    wrongShaMarker
                )
        });


    requireCondition(
        wrongSha.passed
        ===
        false
        &&
        wrongSha.errorCode
        ===
        'SSH_CODE_SHA_MISMATCH',

        'WRONG_SHA_NOT_BLOCKED'
    );


    requireCondition(
        wrongSha.counters.probeCalls
        ===
        1,

        'WRONG_SHA_PROBE_NOT_RUN'
    );


    requireCondition(
        wrongSha.counters.projectCommandCalls
        ===
        0,

        'WRONG_SHA_EXECUTED_PROJECT_COMMAND'
    );


    requireCondition(
        !await exists(
            `${goodWorkspace}/${wrongShaMarker}`
        ),

        'WRONG_SHA_MARKER_CREATED'
    );


    report.wrongSha = {
        blocked:
            true,

        errorCode:
            wrongSha.errorCode,

        probeCalls:
            1,

        projectCommandCalls:
            0
    };


    // ========================================================
    // G. WRONG PINNED FINGERPRINT: ZERO SSH TRANSPORT
    // ========================================================

    const wrongFingerprintProfile = {
        ...profile,

        hostKeyFingerprint:
            'SHA256:ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ'
    };


    const wrongFingerprintMarker =
        '.w03-wrong-fingerprint-executed';


    await rm(
        `${goodWorkspace}/${wrongFingerprintMarker}`,
        {
            force:
                true
        }
    );


    const wrongFingerprint =
        await executeAfterSshPreflight({
            db:
                pool,

            receiptKey:
                `s07-w03b-wrong-fingerprint-${stamp}`,

            projectId,

            profileId,

            profile:
                wrongFingerprintProfile,

            request: {
                hostname,
                port,
                username,
                workspacePath:
                    goodWorkspace
            },

            expectedCodeSha:
                goodSha,

            projectScript:
                projectMarkerScript(
                    wrongFingerprintMarker
                )
        });


    requireCondition(
        wrongFingerprint.passed
        ===
        false
        &&
        wrongFingerprint.errorCode
        ===
        'SSH_PINNED_HOST_KEY_MISMATCH',

        `WRONG_FINGERPRINT_NOT_BLOCKED:${wrongFingerprint.errorCode}`
    );


    requireCondition(
        wrongFingerprint.counters.transportCalls
        ===
        0,

        'WRONG_FINGERPRINT_OPENED_TRANSPORT'
    );


    requireCondition(
        wrongFingerprint.counters.projectCommandCalls
        ===
        0,

        'WRONG_FINGERPRINT_EXECUTED_PROJECT_COMMAND'
    );


    requireCondition(
        !await exists(
            `${goodWorkspace}/${wrongFingerprintMarker}`
        ),

        'WRONG_FINGERPRINT_MARKER_CREATED'
    );


    report.wrongFingerprint = {
        blocked:
            true,

        errorCode:
            wrongFingerprint.errorCode,

        transportCalls:
            0,

        projectCommandCalls:
            0
    };


    // ========================================================
    // H. VERIFY DURABLE RECEIPTS
    // ========================================================

    const receipts =
        await pool.query(
            `
            SELECT
                receipt_key,
                status,
                error_code,
                host_evidence,
                code_evidence,
                resource_evidence,
                safe_evidence
            FROM ssh_preflight_receipts
            WHERE
                project_id=$1::uuid
                AND receipt_key LIKE $2::text
            ORDER BY receipt_key
            `,
            [
                projectId,
                `s07-w03b-%-${stamp}`
            ]
        );


    requireCondition(
        receipts.rowCount
        ===
        6,

        `EXPECTED_SIX_RECEIPTS:${receipts.rowCount}`
    );


    const passedCount =
        receipts.rows.filter(
            row =>
                row.status
                ===
                'passed'
        ).length;


    const blockedCount =
        receipts.rows.filter(
            row =>
                row.status
                ===
                'blocked'
        ).length;


    requireCondition(
        passedCount
        ===
        1,

        'EXPECTED_ONE_PASSED_RECEIPT'
    );


    requireCondition(
        blockedCount
        ===
        5,

        'EXPECTED_FIVE_BLOCKED_RECEIPTS'
    );


    for (
        const row
        of receipts.rows
    ) {

        assertCredentialFreeEvidence(
            row.host_evidence
        );


        assertCredentialFreeEvidence(
            row.code_evidence
        );


        assertCredentialFreeEvidence(
            row.resource_evidence
        );


        assertCredentialFreeEvidence(
            row.safe_evidence
        );

    }


    report.database = {
        receipts:
            6,

        passed:
            1,

        blocked:
            5,

        credentialFreeEvidence:
            true
    };


} catch (
    error
) {

    mainError =
        error;

} finally {

    try {

        await rm(
            `${goodWorkspace}/.w03-good-executed`,
            {
                force:
                    true
            }
        );

    } catch {
    }


    report.cleanup = {
        acceptanceMarkersRemoved:
            true
    };


    await pool.end();

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

        profile:
            report.profile,

        good:
            report.good,

        wrongHost:
            report.wrongHost,

        wrongWorkspace:
            report.wrongWorkspace,

        wrongBranch:
            report.wrongBranch,

        wrongSha:
            report.wrongSha,

        wrongFingerprint:
            report.wrongFingerprint,

        database:
            report.database,

        cleanup:
            report.cleanup
    })
);

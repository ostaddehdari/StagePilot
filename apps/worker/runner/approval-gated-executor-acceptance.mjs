import {
    access,
    readFile,
    rm,
    writeFile
} from 'node:fs/promises';

import {
    constants as fsConstants
} from 'node:fs';

import {
    Pool
} from 'pg';

import {
    persistValidatedPackage
} from './script-package-orchestrator.mjs';

import {
    quarantinePackage,
    persistQuarantine,
    approveQuarantine
} from './script-package-quarantine.mjs';

import {
    executeApprovedPackage
} from './approval-gated-executor.mjs';


const projectId =
    process.env.STAGEPILOT_PROJECT_ID;


const quarantineRoot =
    process.env.STAGEPILOT_QUARANTINE_ROOT;


const workspaceRoot =
    process.env.STAGEPILOT_WORKSPACE_ROOT;


if (
    process.env.STAGEPILOT_W02B_ACCEPTANCE
    !==
    '1'
) {

    throw new Error(
        'ACCEPTANCE_NOT_ENABLED'
    );

}


if (
    !projectId
    ||
    !quarantineRoot
    ||
    !workspaceRoot
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


const serverKey =
    'stagepilot-local-test-server';


const tamper = {
    packageKey:
        `s07-w02b-tamper-package-${stamp}`,

    requestMarker:
        `REQ-S07-W02B-TAMPER-${stamp}`,

    runKey:
        `s07-w02b-tamper-${stamp}`,

    quarantinePath:
        `${quarantineRoot}/s07-w02b-tamper-${stamp}`,

    workspacePath:
        `${workspaceRoot}/s07-w02b-tamper-${stamp}`,

    approvalKey:
        `s07-w02b-tamper-approval-${stamp}`
};


const valid = {
    packageKey:
        `s07-w02b-valid-package-${stamp}`,

    requestMarker:
        `REQ-S07-W02B-VALID-${stamp}`,

    runKey:
        `s07-w02b-valid-${stamp}`,

    quarantinePath:
        `${quarantineRoot}/s07-w02b-valid-${stamp}`,

    workspacePath:
        `${workspaceRoot}/s07-w02b-valid-${stamp}`,

    approvalKey:
        `s07-w02b-valid-approval-${stamp}`
};


const packageIds = [];


const quarantinePaths = [
    tamper.quarantinePath,
    valid.quarantinePath
];


const workspacePaths = [
    tamper.workspacePath,
    valid.workspacePath
];


const report = {
    tamper: {},
    valid: {},
    replay: {},
    cleanup: {}
};


function script(
    filename,
    runKey,
    markerName
) {

    return [
        '#!/usr/bin/env bash',
        '# STAGEPILOT-PROGRAM: stagepilot',
        '# STAGEPILOT-STAGE: S07',
        '# STAGEPILOT-WORK: W02',
        `# STAGEPILOT-RUN: ${runKey}`,
        `# STAGEPILOT-FILE: ${filename}`,
        'set -Eeuo pipefail',
        '',
        `printf "EXECUTED\\n" > ${markerName}`,
        'echo EXECUTION_OK',
        ''
    ].join(
        '\n'
    );

}


function responseFor({
    requestMarker,
    runKey,
    markerName
}) {

    return {
        response_type:
            'script_batch',

        request_marker:
            requestMarker,

        program: {
            id:
                'stagepilot',

            stage_key:
                'S07',

            work_key:
                'W02',

            run_key:
                runKey
        },

        files: [
            {
                filename:
                    '01-run.sh',

                dependencies:
                    [],

                content:
                    script(
                        '01-run.sh',
                        runKey,
                        markerName
                    )
            }
        ]
    };

}


async function createApprovedFixture(
    fixture,
    markerName
) {

    const persisted =
        await persistValidatedPackage({
            db:
                pool,

            projectId,

            packageKey:
                fixture.packageKey,

            rawResponse:
                JSON.stringify(
                    responseFor({
                        requestMarker:
                            fixture.requestMarker,

                        runKey:
                            fixture.runKey,

                        markerName
                    })
                ),

            expectedRequestMarker:
                fixture.requestMarker
        });


    packageIds.push(
        persisted.package.id
    );


    const quarantined =
        await quarantinePackage({
            manifest:
                persisted.manifest,

            baseQuarantineRoot:
                quarantineRoot,

            quarantinePath:
                fixture.quarantinePath
        });


    const quarantineRow =
        await persistQuarantine({
            db:
                pool,

            projectId,

            packageId:
                persisted.package.id,

            manifest:
                persisted.manifest,

            quarantineResult:
                quarantined,

            serverKey,

            workspacePath:
                fixture.workspacePath
        });


    const approval =
        await approveQuarantine({
            db:
                pool,

            approvalKey:
                fixture.approvalKey,

            quarantineId:
                quarantineRow.id,

            packageId:
                persisted.package.id,

            manifestSha256:
                persisted.manifest.manifestSha256,

            serverKey,

            workspacePath:
                fixture.workspacePath
        });


    return {
        persisted,
        quarantineRow,
        approval
    };

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


let mainError =
    null;


try {

    // ========================================================
    // A. TAMPERED APPROVAL MUST NEVER START A SCRIPT
    // ========================================================

    const tamperFixture =
        await createApprovedFixture(
            tamper,
            'tamper-executed.marker'
        );


    const approvedContent =
        await readFile(
            `${tamper.quarantinePath}/01-run.sh`,
            'utf8'
        );


    await writeFile(
        `${tamper.quarantinePath}/01-run.sh`,
        `${approvedContent}\necho TAMPERED\n`,
        'utf8'
    );


    let tamperRejected =
        false;

    let tamperError =
        '';


    try {

        await executeApprovedPackage({
            db:
                pool,

            approvalId:
                tamperFixture.approval.id,

            packageRecord:
                tamperFixture.persisted.package,

            manifest:
                tamperFixture.persisted.manifest,

            serverKey,

            workspacePath:
                tamper.workspacePath
        });

    } catch (
        error
    ) {

        tamperRejected =
            true;

        tamperError =
            error?.message
            ??
            String(
                error
            );

    }


    if (
        !tamperRejected
        ||
        tamperError
        !==
        'QUARANTINE_FILE_HASH_MISMATCH:01-run.sh'
    ) {

        throw new Error(
            `TAMPER_NOT_REJECTED:${tamperError}`
        );

    }


    const tamperOutcomeCount =
        await pool.query(
            `
            SELECT COUNT(*)::integer AS count
            FROM script_package_file_outcomes
            WHERE package_id=$1::uuid
            `,
            [
                tamperFixture.persisted.package.id
            ]
        );


    if (
        Number(
            tamperOutcomeCount.rows[0]?.count
            ??
            0
        )
        !==
        0
    ) {

        throw new Error(
            'TAMPERED_APPROVAL_STARTED_EXECUTION'
        );

    }


    if (
        await exists(
            `${tamper.workspacePath}/tamper-executed.marker`
        )
    ) {

        throw new Error(
            'TAMPERED_APPROVAL_CREATED_EXECUTION_MARKER'
        );

    }


    const invalidated =
        await pool.query(
            `
            SELECT
                a.status AS approval_status,
                a.revoked_at,
                q.status AS quarantine_status,
                q.integrity_valid
            FROM script_package_approvals a
            JOIN script_package_quarantines q
                ON q.id=a.quarantine_id
            WHERE a.id=$1::uuid
            `,
            [
                tamperFixture.approval.id
            ]
        );


    const invalidatedRow =
        invalidated.rows[0];


    if (
        invalidatedRow?.approval_status
        !==
        'invalidated'
        ||
        !invalidatedRow?.revoked_at
        ||
        invalidatedRow?.quarantine_status
        !==
        'invalidated'
        ||
        invalidatedRow?.integrity_valid
        !==
        false
    ) {

        throw new Error(
            'TAMPER_DETECTION_NOT_DURABLY_INVALIDATED'
        );

    }


    // Restore original bytes. Old approval must still stay dead.
    await writeFile(
        `${tamper.quarantinePath}/01-run.sh`,
        approvedContent,
        'utf8'
    );


    let staleApprovalRejected =
        false;

    let staleApprovalError =
        '';


    try {

        await executeApprovedPackage({
            db:
                pool,

            approvalId:
                tamperFixture.approval.id,

            packageRecord:
                tamperFixture.persisted.package,

            manifest:
                tamperFixture.persisted.manifest,

            serverKey,

            workspacePath:
                tamper.workspacePath
        });

    } catch (
        error
    ) {

        staleApprovalRejected =
            true;

        staleApprovalError =
            error?.message
            ??
            String(
                error
            );

    }


    if (
        !staleApprovalRejected
        ||
        staleApprovalError
        !==
        'APPROVAL_NOT_ACTIVE'
    ) {

        throw new Error(
            `INVALIDATED_APPROVAL_REUSED:${staleApprovalError}`
        );

    }


    const tamperOutcomeCountAfterRestore =
        await pool.query(
            `
            SELECT COUNT(*)::integer AS count
            FROM script_package_file_outcomes
            WHERE package_id=$1::uuid
            `,
            [
                tamperFixture.persisted.package.id
            ]
        );


    if (
        Number(
            tamperOutcomeCountAfterRestore.rows[0]?.count
            ??
            0
        )
        !==
        0
    ) {

        throw new Error(
            'INVALIDATED_APPROVAL_EXECUTED_AFTER_RESTORE'
        );

    }


    report.tamper = {
        tamperDetected:
            true,

        executionStarted:
            false,

        outcomesCreated:
            0,

        executionMarkerCreated:
            false,

        approvalInvalidated:
            true,

        quarantineInvalidated:
            true,

        approvalReusableAfterRestore:
            false
    };


    // ========================================================
    // B. VALID APPROVAL MUST EXECUTE EXACTLY ONCE
    // ========================================================

    const validFixture =
        await createApprovedFixture(
            valid,
            'valid-executed.marker'
        );


    const executed =
        await executeApprovedPackage({
            db:
                pool,

            approvalId:
                validFixture.approval.id,

            packageRecord:
                validFixture.persisted.package,

            manifest:
                validFixture.persisted.manifest,

            serverKey,

            workspacePath:
                valid.workspacePath
        });


    if (
        executed.gate?.approved
        !==
        true
        ||
        executed.gate?.verifiedImmediatelyBeforeExecution
        !==
        true
        ||
        executed.consumedApproval?.status
        !==
        'consumed'
    ) {

        throw new Error(
            'VALID_APPROVAL_GATE_RESULT_INVALID'
        );

    }


    if (
        executed.execution?.outcomes?.[
            '01-run.sh'
        ]
        !==
        'success'
    ) {

        throw new Error(
            'VALID_APPROVAL_SCRIPT_DID_NOT_EXECUTE'
        );

    }


    if (
        !await exists(
            `${valid.workspacePath}/valid-executed.marker`
        )
    ) {

        throw new Error(
            'VALID_EXECUTION_MARKER_MISSING'
        );

    }


    const markerContent =
        await readFile(
            `${valid.workspacePath}/valid-executed.marker`,
            'utf8'
        );


    if (
        markerContent.trim()
        !==
        'EXECUTED'
    ) {

        throw new Error(
            'VALID_EXECUTION_MARKER_INVALID'
        );

    }


    const validOutcomes =
        await pool.query(
            `
            SELECT
                COUNT(*)::integer AS count,
                COUNT(*) FILTER (
                    WHERE outcome='success'
                )::integer AS success_count
            FROM script_package_file_outcomes
            WHERE package_id=$1::uuid
            `,
            [
                validFixture.persisted.package.id
            ]
        );


    if (
        Number(
            validOutcomes.rows[0]?.count
            ??
            0
        )
        !==
        1
        ||
        Number(
            validOutcomes.rows[0]?.success_count
            ??
            0
        )
        !==
        1
    ) {

        throw new Error(
            'VALID_EXECUTION_OUTCOME_INVALID'
        );

    }


    const approvalState =
        await pool.query(
            `
            SELECT
                status,
                consumed_at
            FROM script_package_approvals
            WHERE id=$1::uuid
            `,
            [
                validFixture.approval.id
            ]
        );


    if (
        approvalState.rows[0]?.status
        !==
        'consumed'
        ||
        !approvalState.rows[0]?.consumed_at
    ) {

        throw new Error(
            'VALID_APPROVAL_NOT_CONSUMED'
        );

    }


    // ========================================================
    // C. SAME APPROVAL MAY NOT EXECUTE TWICE
    // ========================================================

    let replayRejected =
        false;

    let replayError =
        '';


    try {

        await executeApprovedPackage({
            db:
                pool,

            approvalId:
                validFixture.approval.id,

            packageRecord:
                validFixture.persisted.package,

            manifest:
                validFixture.persisted.manifest,

            serverKey,

            workspacePath:
                valid.workspacePath
        });

    } catch (
        error
    ) {

        replayRejected =
            true;

        replayError =
            error?.message
            ??
            String(
                error
            );

    }


    if (
        !replayRejected
        ||
        replayError
        !==
        'APPROVAL_NOT_ACTIVE'
    ) {

        throw new Error(
            `CONSUMED_APPROVAL_REPLAY_NOT_REJECTED:${replayError}`
        );

    }


    const outcomesAfterReplay =
        await pool.query(
            `
            SELECT COUNT(*)::integer AS count
            FROM script_package_file_outcomes
            WHERE package_id=$1::uuid
            `,
            [
                validFixture.persisted.package.id
            ]
        );


    if (
        Number(
            outcomesAfterReplay.rows[0]?.count
            ??
            0
        )
        !==
        1
    ) {

        throw new Error(
            'REPLAY_CREATED_SECOND_OUTCOME'
        );

    }


    report.valid = {
        approvalVerifiedImmediatelyBeforeExecution:
            true,

        approvalConsumedBeforeExecutionStart:
            true,

        scriptExecuted:
            true,

        outcome:
            'success',

        executionMarker:
            true,

        outcomeRows:
            1
    };


    report.replay = {
        sameApprovalSecondExecution:
            false,

        replayRejected:
            true,

        outcomeRowsAfterReplay:
            1
    };


} catch (
    error
) {

    mainError =
        error;

} finally {

    const cleanupErrors = [];


    for (
        const packageId
        of packageIds
    ) {

        try {

            await pool.query(
                `
                DELETE FROM script_packages
                WHERE id=$1::uuid
                `,
                [
                    packageId
                ]
            );

        } catch (
            error
        ) {

            cleanupErrors.push(
                `PACKAGE:${error?.message ?? error}`
            );

        }

    }


    for (
        const path
        of quarantinePaths
    ) {

        try {

            if (
                path.startsWith(
                    `${quarantineRoot}/s07-w02b-`
                )
            ) {

                await rm(
                    path,
                    {
                        recursive:
                            true,

                        force:
                            true
                    }
                );

            } else {

                throw new Error(
                    'UNSAFE_QUARANTINE_CLEANUP_PATH'
                );

            }

        } catch (
            error
        ) {

            cleanupErrors.push(
                `QUARANTINE:${error?.message ?? error}`
            );

        }

    }


    for (
        const path
        of workspacePaths
    ) {

        try {

            if (
                path.startsWith(
                    `${workspaceRoot}/s07-w02b-`
                )
            ) {

                await rm(
                    path,
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

    }


    let packagesDeleted =
        true;


    try {

        const result =
            await pool.query(
                `
                SELECT COUNT(*)::integer AS count
                FROM script_packages
                WHERE
                    package_key=$1::text
                    OR package_key=$2::text
                `,
                [
                    tamper.packageKey,
                    valid.packageKey
                ]
            );


        packagesDeleted =
            Number(
                result.rows[0]?.count
                ??
                0
            )
            ===
            0;

    } catch {

        packagesDeleted =
            false;

    }


    report.cleanup = {
        packagesDeleted,

        quarantinesDeleted:
            true,

        workspacesDeleted:
            true,

        cleanupErrors
    };


    await pool.end();


    if (
        cleanupErrors.length > 0
        ||
        packagesDeleted
        !==
        true
    ) {

        if (!mainError) {

            mainError =
                new Error(
                    `ACCEPTANCE_CLEANUP_FAILED:${cleanupErrors.join(';')}`
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

        tamper:
            report.tamper,

        valid:
            report.valid,

        replay:
            report.replay,

        cleanup:
            report.cleanup
    })
);

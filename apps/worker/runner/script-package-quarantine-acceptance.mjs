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
    validateScriptPackage
} from './script-package-contract.mjs';

import {
    persistValidatedPackage
} from './script-package-orchestrator.mjs';

import {
    quarantinePackage,
    persistQuarantine,
    approveQuarantine,
    verifyApproval
} from './script-package-quarantine.mjs';


const projectId =
    process.env.STAGEPILOT_PROJECT_ID;


const quarantineRoot =
    process.env.STAGEPILOT_QUARANTINE_ROOT;


const workspaceRoot =
    process.env.STAGEPILOT_WORKSPACE_ROOT;


if (
    process.env.STAGEPILOT_W02A_ACCEPTANCE
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


const packageKey =
    `s07-w02a-package-${stamp}`;


const approvalKey =
    `s07-w02a-approval-${stamp}`;


const requestMarker =
    `REQ-S07-W02A-${stamp}`;


const runKey =
    `s07-w02a-${stamp}`;


const quarantinePath =
    `${quarantineRoot}/s07-w02-${stamp}`;


const workspacePath =
    `${workspaceRoot}/s07-w02-${stamp}`;


const serverKey =
    'stagepilot-local-test-server';


let packageId =
    null;


let approvalId =
    null;


const report = {
    quarantine: {},
    approval: {},
    rejection: {},
    cleanup: {}
};


function script(
    filename,
    body
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
        body,
        ''
    ].join(
        '\n'
    );

}


const response = {
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
                '01-first.sh',

            dependencies:
                [],

            content:
                script(
                    '01-first.sh',
                    [
                        'printf "EXECUTED" > should-not-exist-first.marker',
                        'echo FIRST'
                    ].join(
                        '\n'
                    )
                )
        },

        {
            filename:
                '02-second.sh',

            dependencies: [
                '01-first.sh'
            ],

            content:
                script(
                    '02-second.sh',
                    [
                        'printf "EXECUTED" > should-not-exist-second.marker',
                        'echo SECOND'
                    ].join(
                        '\n'
                    )
                )
        }
    ]
};


let mainError =
    null;


try {

    // ========================================================
    // A. CONTRACT REJECTION TESTS BEFORE QUARANTINE
    // ========================================================

    let incompleteRejected =
        false;


    try {

        const bad =
            structuredClone(
                response
            );


        delete bad.files[
            0
        ].content;


        validateScriptPackage(
            bad,
            {
                expectedRequestMarker:
                    requestMarker
            }
        );

    } catch (
        error
    ) {

        incompleteRejected =
            error.message.startsWith(
                'SCRIPT_CONTENT_REQUIRED'
            );

    }


    if (!incompleteRejected) {

        throw new Error(
            'INCOMPLETE_RESPONSE_NOT_REJECTED'
        );

    }


    let traversalRejected =
        false;


    try {

        const bad =
            structuredClone(
                response
            );


        bad.files[
            0
        ].filename =
            '../01-first.sh';


        validateScriptPackage(
            bad,
            {
                expectedRequestMarker:
                    requestMarker
            }
        );

    } catch (
        error
    ) {

        traversalRejected =
            error.message
            ===
            'UNSAFE_SCRIPT_FILENAME';

    }


    if (!traversalRejected) {

        throw new Error(
            'TRAVERSAL_NOT_REJECTED'
        );

    }


    let headerMismatchRejected =
        false;


    try {

        const bad =
            structuredClone(
                response
            );


        bad.files[
            0
        ].content =
            bad.files[
                0
            ].content.replace(
                '# STAGEPILOT-FILE: 01-first.sh',
                '# STAGEPILOT-FILE: wrong.sh'
            );


        validateScriptPackage(
            bad,
            {
                expectedRequestMarker:
                    requestMarker
            }
        );

    } catch (
        error
    ) {

        headerMismatchRejected =
            error.message
            ===
            'SCRIPT_HEADER_FILENAME_MISMATCH:01-first.sh';

    }


    if (!headerMismatchRejected) {

        throw new Error(
            'HEADER_MISMATCH_NOT_REJECTED'
        );

    }


    // ========================================================
    // B. PERSIST FULL VALID PACKAGE
    // ========================================================

    const persisted =
        await persistValidatedPackage({
            db:
                pool,

            projectId,

            packageKey,

            rawResponse:
                JSON.stringify(
                    response
                ),

            expectedRequestMarker:
                requestMarker
        });


    packageId =
        persisted.package.id;


    // ========================================================
    // C. QUARANTINE WITHOUT EXECUTION
    // ========================================================

    const quarantined =
        await quarantinePackage({
            manifest:
                persisted.manifest,

            baseQuarantineRoot:
                quarantineRoot,

            quarantinePath
        });


    if (
        quarantined.fileCount
        !==
        2
        ||
        quarantined.syntaxValid
        !==
        true
        ||
        quarantined.integrityValid
        !==
        true
        ||
        quarantined.executed
        !==
        false
    ) {

        throw new Error(
            'QUARANTINE_RESULT_INVALID'
        );

    }


    for (
        const marker
        of [
            'should-not-exist-first.marker',
            'should-not-exist-second.marker'
        ]
    ) {

        let exists =
            false;


        try {

            await access(
                `${quarantinePath}/${marker}`,
                fsConstants.F_OK
            );

            exists =
                true;

        } catch {

            exists =
                false;

        }


        if (exists) {

            throw new Error(
                `SCRIPT_EXECUTED_DURING_QUARANTINE:${marker}`
            );

        }

    }


    // ========================================================
    // D. PERSIST QUARANTINE + CREATE APPROVAL
    // ========================================================

    const quarantineRow =
        await persistQuarantine({
            db:
                pool,

            projectId,

            packageId,

            manifest:
                persisted.manifest,

            quarantineResult:
                quarantined,

            serverKey,

            workspacePath
        });


    const approval =
        await approveQuarantine({
            db:
                pool,

            approvalKey,

            quarantineId:
                quarantineRow.id,

            packageId,

            manifestSha256:
                persisted.manifest.manifestSha256,

            serverKey,

            workspacePath
        });


    approvalId =
        approval.id;


    const validApproval =
        await verifyApproval({
            db:
                pool,

            approvalId,

            manifest:
                persisted.manifest,

            serverKey,

            workspacePath
        });


    if (
        validApproval.approved
        !==
        true
        ||
        validApproval.integrityValid
        !==
        true
        ||
        validApproval.syntaxValid
        !==
        true
    ) {

        throw new Error(
            'VALID_APPROVAL_REJECTED'
        );

    }


    // ========================================================
    // E. WRONG SERVER / WORKSPACE MUST INVALIDATE APPROVAL
    // ========================================================

    let wrongServerRejected =
        false;


    try {

        await verifyApproval({
            db:
                pool,

            approvalId,

            manifest:
                persisted.manifest,

            serverKey:
                'different-server',

            workspacePath
        });

    } catch (
        error
    ) {

        wrongServerRejected =
            error.message
            ===
            'APPROVAL_SERVER_CHANGED';

    }


    if (!wrongServerRejected) {

        throw new Error(
            'OLD_APPROVAL_ACCEPTED_FOR_WRONG_SERVER'
        );

    }


    let wrongWorkspaceRejected =
        false;


    try {

        await verifyApproval({
            db:
                pool,

            approvalId,

            manifest:
                persisted.manifest,

            serverKey,

            workspacePath:
                `${workspaceRoot}/different-workspace`
        });

    } catch (
        error
    ) {

        wrongWorkspaceRejected =
            error.message
            ===
            'APPROVAL_WORKSPACE_CHANGED';

    }


    if (!wrongWorkspaceRejected) {

        throw new Error(
            'OLD_APPROVAL_ACCEPTED_FOR_WRONG_WORKSPACE'
        );

    }


    // ========================================================
    // F. TAMPER AFTER APPROVAL
    // ========================================================

    const originalSecond =
        await readFile(
            `${quarantinePath}/02-second.sh`,
            'utf8'
        );


    await writeFile(
        `${quarantinePath}/02-second.sh`,
        `${originalSecond}\necho TAMPERED\n`,
        'utf8'
    );


    let tamperRejected =
        false;


    try {

        await verifyApproval({
            db:
                pool,

            approvalId,

            manifest:
                persisted.manifest,

            serverKey,

            workspacePath
        });

    } catch (
        error
    ) {

        tamperRejected =
            error.message
            ===
            'QUARANTINE_FILE_HASH_MISMATCH:02-second.sh';

    }


    if (!tamperRejected) {

        throw new Error(
            'TAMPERED_FILE_ACCEPTED_WITH_OLD_APPROVAL'
        );

    }


    // ========================================================
    // G. INVALID BASH SYNTAX REJECTED BEFORE APPROVAL
    // ========================================================

    const syntaxBad =
        structuredClone(
            response
        );


    syntaxBad.program.run_key =
        `${runKey}-syntax`;


    syntaxBad.files[
        0
    ].content =
        [
            '#!/usr/bin/env bash',
            '# STAGEPILOT-PROGRAM: stagepilot',
            '# STAGEPILOT-STAGE: S07',
            '# STAGEPILOT-WORK: W02',
            `# STAGEPILOT-RUN: ${runKey}-syntax`,
            '# STAGEPILOT-FILE: 01-first.sh',
            'set -Eeuo pipefail',
            '',
            'if true; then',
            'echo broken',
            ''
        ].join(
            '\n'
        );


    syntaxBad.files[
        1
    ].content =
        syntaxBad.files[
            1
        ].content.replace(
            `# STAGEPILOT-RUN: ${runKey}`,
            `# STAGEPILOT-RUN: ${runKey}-syntax`
        );


    const syntaxManifest =
        validateScriptPackage(
            syntaxBad,
            {
                expectedRequestMarker:
                    requestMarker
            }
        );


    let syntaxRejected =
        false;


    const syntaxQuarantine =
        `${quarantineRoot}/s07-w02-syntax-${stamp}`;


    try {

        await quarantinePackage({
            manifest:
                syntaxManifest,

            baseQuarantineRoot:
                quarantineRoot,

            quarantinePath:
                syntaxQuarantine
        });

    } catch (
        error
    ) {

        syntaxRejected =
            error.message
            ===
            'BASH_SYNTAX_FAILED:01-first.sh';

    } finally {

        await rm(
            syntaxQuarantine,
            {
                recursive:
                    true,

                force:
                    true
            }
        );

    }


    if (!syntaxRejected) {

        throw new Error(
            'INVALID_BASH_SYNTAX_NOT_REJECTED'
        );

    }


    report.quarantine = {
        files:
            2,

        hashesVerified:
            true,

        bashSyntaxVerified:
            true,

        scriptExecutionDuringQuarantine:
            false,

        sourceEvalUsed:
            false
    };


    report.approval = {
        created:
            true,

        manifestBound:
            true,

        serverBound:
            true,

        workspaceBound:
            true,

        validApprovalVerified:
            true
    };


    report.rejection = {
        incompleteResponse:
            true,

        traversal:
            true,

        headerMismatch:
            true,

        wrongServer:
            true,

        wrongWorkspace:
            true,

        tamperAfterApproval:
            true,

        invalidBashSyntax:
            true
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
            packageId
        ) {

            await pool.query(
                `
                DELETE FROM script_packages
                WHERE id=$1::uuid
                `,
                [
                    packageId
                ]
            );

        }

    } catch (
        error
    ) {

        cleanupErrors.push(
            `PACKAGE:${error?.message ?? error}`
        );

    }


    try {

        if (
            quarantinePath.startsWith(
                `${quarantineRoot}/s07-w02-`
            )
        ) {

            await rm(
                quarantinePath,
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


    let packageDeleted =
        true;


    try {

        const result =
            await pool.query(
                `
                SELECT COUNT(*)::integer AS count
                FROM script_packages
                WHERE package_key=$1::text
                `,
                [
                    packageKey
                ]
            );


        packageDeleted =
            Number(
                result.rows[0]?.count
                ??
                0
            )
            ===
            0;

    } catch {

        packageDeleted =
            false;

    }


    report.cleanup = {
        packageDeleted,

        quarantineDeleted:
            true,

        cleanupErrors
    };


    await pool.end();


    if (
        cleanupErrors.length > 0
        ||
        packageDeleted
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

        quarantine:
            report.quarantine,

        approval:
            report.approval,

        rejection:
            report.rejection,

        cleanup:
            report.cleanup
    })
);

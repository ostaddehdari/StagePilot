import {
    verifyApproval
} from './script-package-quarantine.mjs';

import {
    executeValidatedPackage
} from './script-package-orchestrator.mjs';


const INTEGRITY_ERRORS = [
    'QUARANTINE_FILE_SET_CHANGED',
    'QUARANTINE_FILE_HASH_MISMATCH:',
    'QUARANTINE_FILE_SYNTAX_CHANGED:'
];


export function isIntegrityFailure(
    error
) {

    const message =
        String(
            error?.message
            ??
            error
            ??
            ''
        );


    return INTEGRITY_ERRORS.some(
        prefix =>
            message
            ===
            prefix
            ||
            message.startsWith(
                prefix
            )
    );

}


export async function invalidateApprovalForIntegrityFailure({

    db,
    approvalId,
    reason

}) {

    const client =
        await db.connect();


    try {

        await client.query(
            'BEGIN'
        );


        const approvalResult =
            await client.query(
                `
                UPDATE script_package_approvals
                SET
                    status='invalidated',
                    revoked_at=COALESCE(
                        revoked_at,
                        now()
                    ),
                    approval_json=
                        approval_json
                        ||
                        jsonb_build_object(
                            'invalidatedByIntegrityFailure',
                            true,
                            'reason',
                            $2::text
                        ),
                    updated_at=now()
                WHERE
                    id=$1::uuid
                    AND status='approved'
                RETURNING
                    id,
                    quarantine_id,
                    package_id
                `,
                [
                    approvalId,
                    reason
                ]
            );


        if (
            approvalResult.rowCount
            ===
            1
        ) {

            const approval =
                approvalResult.rows[0];


            await client.query(
                `
                UPDATE script_package_quarantines
                SET
                    status='invalidated',
                    integrity_valid=false,
                    error_json=
                        error_json
                        ||
                        jsonb_build_object(
                            'reason',
                            $3::text,
                            'approvalInvalidated',
                            true
                        ),
                    updated_at=now()
                WHERE
                    id=$1::uuid
                    AND package_id=$2::uuid
                `,
                [
                    approval.quarantine_id,
                    approval.package_id,
                    reason
                ]
            );

        }


        await client.query(
            'COMMIT'
        );


        return {
            invalidated:
                approvalResult.rowCount
                ===
                1
        };


    } catch (
        error
    ) {

        await client.query(
            'ROLLBACK'
        );


        throw error;

    } finally {

        client.release();

    }

}


export async function enforceApprovalGate({

    db,
    approvalId,
    manifest,
    serverKey,
    workspacePath

}) {

    try {

        const verification =
            await verifyApproval({
                db,
                approvalId,
                manifest,
                serverKey,
                workspacePath
            });


        return {
            approved:
                true,

            verifiedImmediatelyBeforeExecution:
                true,

            integrityValid:
                verification.integrityValid,

            syntaxValid:
                verification.syntaxValid,

            manifestSha256:
                verification.manifestSha256,

            bindingSha256:
                verification.bindingSha256,

            quarantineRoot:
                verification.quarantineRoot
        };


    } catch (
        error
    ) {

        if (
            isIntegrityFailure(
                error
            )
        ) {

            await invalidateApprovalForIntegrityFailure({
                db,
                approvalId,
                reason:
                    error.message
            });

        }


        throw error;

    }

}


export async function consumeApproval({

    db,
    approvalId

}) {

    const result =
        await db.query(
            `
            UPDATE script_package_approvals
            SET
                status='consumed',
                consumed_at=now(),
                approval_json=
                    approval_json
                    ||
                    jsonb_build_object(
                        'singleUse',
                        true,
                        'consumedBeforeExecutionStart',
                        true
                    ),
                updated_at=now()
            WHERE
                id=$1::uuid
                AND status='approved'
            RETURNING *
            `,
            [
                approvalId
            ]
        );


    if (
        result.rowCount
        !==
        1
    ) {

        throw new Error(
            'APPROVAL_CONSUME_RACE_OR_INACTIVE'
        );

    }


    return result.rows[0];

}


export async function executeApprovedPackage({

    db,
    approvalId,
    packageRecord,
    manifest,
    serverKey,
    workspacePath

}) {

    const gate =
        await enforceApprovalGate({
            db,
            approvalId,
            manifest,
            serverKey,
            workspacePath
        });


    if (
        gate.approved
        !==
        true
        ||
        gate.integrityValid
        !==
        true
        ||
        gate.syntaxValid
        !==
        true
    ) {

        throw new Error(
            'APPROVAL_GATE_NOT_SATISFIED'
        );

    }


    const consumedApproval =
        await consumeApproval({
            db,
            approvalId
        });


    const execution =
        await executeValidatedPackage({
            db,
            packageRecord,
            manifest,
            workspacePath
        });


    return {
        gate,

        consumedApproval: {
            id:
                consumedApproval.id,

            status:
                consumedApproval.status,

            consumedAt:
                consumedApproval.consumed_at
        },

        execution
    };

}

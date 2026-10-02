import {
    executeApprovedRequest
} from './repository-executor.mjs';


export function rowToRepositoryRequest(
    row
) {

    if (!row) {

        throw new Error(
            'REPOSITORY_REQUEST_ROW_REQUIRED'
        );

    }


    return {
        id:
            row.id,

        projectId:
            row.project_id,

        accessProfileId:
            row.access_profile_id,

        requestKey:
            row.request_key,

        mode:
            row.mode,

        owner:
            row.owner_login,

        repositoryName:
            row.repository_name,

        visibility:
            row.visibility,

        defaultBranch:
            row.default_branch,

        requestFingerprint:
            row.request_fingerprint,

        status:
            row.status,

        approved:
            Boolean(
                row.approved_at
            ),

        githubRepositoryId:
            row.github_repository_id
            ??
            null,

        publicExplicitlyApproved:
            row.result_json?.publicExplicitlyApproved
            ===
            true
    };

}


export function rowToBinding(
    row
) {

    if (!row) {

        return null;

    }


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
            row.repository_name,

        fullName:
            row.full_name,

        htmlUrl:
            row.html_url,

        sshUrl:
            row.ssh_url,

        visibility:
            row.visibility,

        defaultBranch:
            row.default_branch,

        bindingMode:
            row.binding_mode,

        createdByStagePilot:
            row.created_by_stagepilot,

        status:
            row.status
    };

}


export async function loadRepositoryRequest(
    db,
    requestId
) {

    const result =
        await db.query(
            `
            SELECT *
            FROM github_repository_requests
            WHERE id=$1
            LIMIT 1
            `,
            [
                requestId
            ]
        );


    if (
        result.rowCount
        !==
        1
    ) {

        throw new Error(
            'REPOSITORY_REQUEST_NOT_FOUND'
        );

    }


    return result.rows[0];

}


export async function loadProjectBinding(
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
        ===
        0
    ) {

        return null;

    }


    return result.rows[0];

}


export async function claimApprovedRequest(
    db,
    requestId
) {

    const result =
        await db.query(
            `
            UPDATE github_repository_requests
            SET
                status='executing',
                execution_started_at=COALESCE(
                    execution_started_at,
                    now()
                ),
                updated_at=now()
            WHERE
                id=$1
                AND status='approved'
                AND approved_at IS NOT NULL
            RETURNING *
            `,
            [
                requestId
            ]
        );


    if (
        result.rowCount
        ===
        1
    ) {

        return {
            claimed:
                true,

            row:
                result.rows[0]
        };

    }


    return {
        claimed:
            false,

        row:
            await loadRepositoryRequest(
                db,
                requestId
            )
    };

}


function compareBindingIdentity(
    existing,
    incoming
) {

    if (
        String(
            existing.github_repository_id
        )
        !==
        String(
            incoming.githubRepositoryId
        )
        ||
        String(
            existing.full_name
        ).toLowerCase()
        !==
        String(
            incoming.fullName
        ).toLowerCase()
    ) {

        throw new Error(
            'PROJECT_ALREADY_BOUND_TO_DIFFERENT_REPOSITORY'
        );

    }


    return true;

}


export async function persistSuccessfulBinding(
    db,
    requestRow,
    executionResult
) {

    const binding =
        executionResult?.binding;


    if (!binding) {

        throw new Error(
            'SUCCESS_BINDING_REQUIRED'
        );

    }


    await db.query(
        'BEGIN'
    );


    try {

        const existingResult =
            await db.query(
                `
                SELECT *
                FROM github_project_repositories
                WHERE project_id=$1
                FOR UPDATE
                `,
                [
                    requestRow.project_id
                ]
            );


        if (
            existingResult.rowCount
            ===
            1
        ) {

            compareBindingIdentity(
                existingResult.rows[0],
                binding
            );

        } else {

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
                    $10,
                    $11,
                    $12,
                    $13,
                    'ready',
                    $14::jsonb
                )
                `,
                [
                    requestRow.project_id,
                    requestRow.access_profile_id,
                    requestRow.id,
                    binding.githubRepositoryId,
                    binding.ownerLogin,
                    binding.repositoryName,
                    binding.fullName,
                    binding.htmlUrl,
                    binding.sshUrl,
                    binding.visibility,
                    binding.defaultBranch,
                    binding.bindingMode,
                    binding.createdByStagePilot,
                    JSON.stringify({
                        persistedBy:
                            'repository-request-orchestrator',

                        outcome:
                            executionResult.outcome
                    })
                ]
            );

        }


        await db.query(
            `
            UPDATE github_repository_requests
            SET
                status='succeeded',
                github_repository_id=$2,
                result_json=
                    result_json
                    ||
                    $3::jsonb,
                error_json='{}'::jsonb,
                completed_at=COALESCE(
                    completed_at,
                    now()
                ),
                updated_at=now()
            WHERE id=$1
            `,
            [
                requestRow.id,
                binding.githubRepositoryId,
                JSON.stringify({
                    outcome:
                        executionResult.outcome,

                    fullName:
                        binding.fullName,

                    destinationRepositoryId:
                        binding.githubRepositoryId,

                    exactlyOnce:
                        true
                })
            ]
        );


        await db.query(
            'COMMIT'
        );

    } catch (
        error
    ) {

        await db.query(
            'ROLLBACK'
        );


        throw error;

    }


    return true;

}


export async function persistUncertain(
    db,
    requestId,
    executionResult
) {

    await db.query(
        `
        UPDATE github_repository_requests
        SET
            status='uncertain',
            result_json=
                result_json
                ||
                $2::jsonb,
            error_json=
                error_json
                ||
                $3::jsonb,
            updated_at=now()
        WHERE id=$1
        `,
        [
            requestId,

            JSON.stringify({
                outcome:
                    executionResult?.outcome
                    ??
                    'unknown',

                requiresReconciliation:
                    true,

                automaticRetry:
                    false
            }),

            JSON.stringify({
                reason:
                    'EXTERNAL_OUTCOME_REQUIRES_RECONCILIATION'
            })
        ]
    );

}


export async function persistTerminalFailure(
    db,
    requestId,
    executionResult
) {

    await db.query(
        `
        UPDATE github_repository_requests
        SET
            status='failed',
            result_json=
                result_json
                ||
                $2::jsonb,
            error_json=
                error_json
                ||
                $3::jsonb,
            completed_at=COALESCE(
                completed_at,
                now()
            ),
            updated_at=now()
        WHERE id=$1
        `,
        [
            requestId,

            JSON.stringify({
                outcome:
                    executionResult?.outcome
                    ??
                    'failed',

                automaticRetry:
                    false
            }),

            JSON.stringify({
                reason:
                    executionResult?.outcome
                    ??
                    'REPOSITORY_REQUEST_FAILED'
            })
        ]
    );

}


export function classifyExecutionPersistence(
    result
) {

    if (
        result?.binding
        &&
        (
            result.outcome
            ===
            'created'
            ||
            result.outcome
            ===
            'attached'
            ||
            result.outcome
            ===
            'reconciled'
        )
    ) {

        return 'SUCCESS';

    }


    if (
        result?.requiresReconciliation
        ===
        true
        ||
        result?.outcome
        ===
        'create_uncertain'
        ||
        result?.outcome
        ===
        'reconcile_not_found'
    ) {

        return 'UNCERTAIN';

    }


    if (
        result?.outcome
        ===
        'approval_required'
        ||
        result?.outcome
        ===
        'existing_binding'
        ||
        result?.outcome
        ===
        'existing_result'
    ) {

        return 'NOOP';

    }


    return 'FAILURE';

}


export async function processRepositoryRequest({

    db,

    requestId,

    secretRef,

    executor =
        executeApprovedRequest

}) {

    let requestRow =
        await loadRepositoryRequest(
            db,
            requestId
        );


    let existingBinding =
        await loadProjectBinding(
            db,
            requestRow.project_id
        );


    if (existingBinding) {

        return {
            outcome:
                'existing_binding',

            mutationAttempted:
                false,

            retryAllowed:
                false,

            binding:
                rowToBinding(
                    existingBinding
                )
        };

    }


    let claimHolder =
        false;


    if (
        requestRow.status
        ===
        'approved'
    ) {

        const claim =
            await claimApprovedRequest(
                db,
                requestId
            );


        requestRow =
            claim.row;


        claimHolder =
            claim.claimed;


        if (
            !claimHolder
        ) {

            existingBinding =
                await loadProjectBinding(
                    db,
                    requestRow.project_id
                );


            if (
                existingBinding
            ) {

                return {
                    outcome:
                        'existing_binding',

                    mutationAttempted:
                        false,

                    retryAllowed:
                        false,

                    binding:
                        rowToBinding(
                            existingBinding
                        )
                };

            }

        }

    }


    const request =
        rowToRepositoryRequest(
            requestRow
        );


    if (
        claimHolder
    ) {

        request.status =
            'approved';

        request.approved =
            true;

    }


    let executionResult;


    try {

        executionResult =
            await executor({
                secretRef,
                request,
                existingBinding:
                    existingBinding
                    ? rowToBinding(
                        existingBinding
                    )
                    : null
            });

    } catch (
        error
    ) {

        if (
            claimHolder
            ||
            requestRow.status
            ===
            'executing'
            ||
            requestRow.status
            ===
            'uncertain'
        ) {

            await persistUncertain(
                db,
                requestId,
                {
                    outcome:
                        'executor_exception',

                    requiresReconciliation:
                        true
                }
            );

        }


        throw error;

    }


    const persistence =
        classifyExecutionPersistence(
            executionResult
        );


    if (
        persistence
        ===
        'SUCCESS'
    ) {

        await persistSuccessfulBinding(
            db,
            requestRow,
            executionResult
        );


        return {
            ...executionResult,

            persisted:
                true
        };

    }


    if (
        persistence
        ===
        'UNCERTAIN'
    ) {

        await persistUncertain(
            db,
            requestId,
            executionResult
        );


        return {
            ...executionResult,

            persisted:
                true
        };

    }


    if (
        persistence
        ===
        'FAILURE'
        &&
        (
            claimHolder
            ||
            requestRow.status
            ===
            'executing'
        )
    ) {

        await persistTerminalFailure(
            db,
            requestId,
            executionResult
        );


        return {
            ...executionResult,

            persisted:
                true
        };

    }


    return executionResult;

}

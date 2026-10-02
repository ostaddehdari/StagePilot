import {
    ensureSameCommitOnRetry,
    verifyDestinationSha
} from './git-work-lifecycle.mjs';


export async function loadLifecycle(
    db,
    lifecycleId
) {

    const result =
        await db.query(
            `
            SELECT *
            FROM git_work_lifecycles
            WHERE id=$1
            LIMIT 1
            `,
            [
                lifecycleId
            ]
        );


    if (
        result.rowCount
        !==
        1
    ) {

        throw new Error(
            'GIT_LIFECYCLE_NOT_FOUND'
        );

    }


    return result.rows[0];

}


export async function persistCommitCreated({

    db,
    lifecycleId,
    localCommitSha

}) {

    const result =
        await db.query(
            `
            UPDATE git_work_lifecycles
            SET
                local_commit_sha=$2,
                state='COMMITTED',
                commit_created_at=COALESCE(
                    commit_created_at,
                    now()
                ),
                result_json=
                    result_json
                    ||
                    jsonb_build_object(
                        'commitCreations',
                        COALESCE(
                            (result_json->>'commitCreations')::int,
                            0
                        )
                        +
                        1
                    ),
                updated_at=now()
            WHERE
                id=$1
                AND state='READY_TO_COMMIT'
            RETURNING *
            `,
            [
                lifecycleId,
                localCommitSha
            ]
        );


    if (
        result.rowCount
        !==
        1
    ) {

        throw new Error(
            'COMMIT_PERSISTENCE_INVALID_STATE'
        );

    }


    return result.rows[0];

}


export async function persistPushIntent({

    db,
    lifecycleId,
    localCommitSha

}) {

    const current =
        await loadLifecycle(
            db,
            lifecycleId
        );


    if (
        current.state
        !==
        'COMMITTED'
        &&
        current.state
        !==
        'GIT_PENDING'
    ) {

        throw new Error(
            'PUSH_INTENT_INVALID_STATE'
        );

    }


    ensureSameCommitOnRetry({
        storedLocalCommitSha:
            current.local_commit_sha,

        currentLocalCommitSha:
            localCommitSha
    });


    const result =
        await db.query(
            `
            UPDATE git_work_lifecycles
            SET
                state='PUSH_INTENT',
                push_attempted_at=now(),
                push_attempts=push_attempts + 1,
                updated_at=now()
            WHERE
                id=$1
                AND local_commit_sha=$2
                AND state IN (
                    'COMMITTED',
                    'GIT_PENDING'
                )
            RETURNING *
            `,
            [
                lifecycleId,
                localCommitSha
            ]
        );


    if (
        result.rowCount
        !==
        1
    ) {

        throw new Error(
            'PUSH_INTENT_PERSISTENCE_FAILED'
        );

    }


    return result.rows[0];

}


export async function persistPushFailure({

    db,
    lifecycleId,
    localCommitSha,
    reason

}) {

    const result =
        await db.query(
            `
            UPDATE git_work_lifecycles
            SET
                state='GIT_PENDING',
                error_json=
                    jsonb_build_object(
                        'reason',
                        $3::text,
                        'retryAction',
                        'PUSH_ONLY',
                        'rerunImplementation',
                        false,
                        'recreateCommit',
                        false,
                        'automaticForcePush',
                        false
                    ),
                updated_at=now()
            WHERE
                id=$1
                AND state='PUSH_INTENT'
                AND local_commit_sha=$2
            RETURNING *
            `,
            [
                lifecycleId,
                localCommitSha,
                reason
            ]
        );


    if (
        result.rowCount
        !==
        1
    ) {

        throw new Error(
            'PUSH_FAILURE_PERSISTENCE_FAILED'
        );

    }


    return result.rows[0];

}


export async function persistPushSuccess({

    db,
    lifecycleId,
    localCommitSha,
    remoteCommitSha

}) {

    ensureSameCommitOnRetry({
        storedLocalCommitSha:
            localCommitSha,

        currentLocalCommitSha:
            remoteCommitSha
    });


    const result =
        await db.query(
            `
            UPDATE git_work_lifecycles
            SET
                state='PUSHED',
                remote_commit_sha=$3,
                error_json='{}'::jsonb,
                updated_at=now()
            WHERE
                id=$1
                AND state='PUSH_INTENT'
                AND local_commit_sha=$2
            RETURNING *
            `,
            [
                lifecycleId,
                localCommitSha,
                remoteCommitSha
            ]
        );


    if (
        result.rowCount
        !==
        1
    ) {

        throw new Error(
            'PUSH_SUCCESS_PERSISTENCE_FAILED'
        );

    }


    return result.rows[0];

}


export async function persistVerified({

    db,
    lifecycleId

}) {

    const current =
        await loadLifecycle(
            db,
            lifecycleId
        );


    if (
        current.state
        !==
        'PUSHED'
    ) {

        throw new Error(
            'REMOTE_VERIFY_INVALID_STATE'
        );

    }


    const verification =
        verifyDestinationSha({
            localCommitSha:
                current.local_commit_sha,

            remoteCommitSha:
                current.remote_commit_sha
        });


    if (
        verification.verified
        !==
        true
    ) {

        await db.query(
            `
            UPDATE git_work_lifecycles
            SET
                state='GIT_PENDING',
                error_json=
                    jsonb_build_object(
                        'reason',
                        'REMOTE_SHA_MISMATCH',
                        'retryAction',
                        'PUSH_ONLY',
                        'rerunImplementation',
                        false,
                        'recreateCommit',
                        false
                    ),
                updated_at=now()
            WHERE id=$1
            `,
            [
                lifecycleId
            ]
        );


        throw new Error(
            'REMOTE_SHA_MISMATCH'
        );

    }


    const result =
        await db.query(
            `
            UPDATE git_work_lifecycles
            SET
                state='VERIFIED',
                push_verified_at=now(),
                result_json=
                    result_json
                    ||
                    jsonb_build_object(
                        'destinationShaVerified',
                        true,
                        'rerunImplementation',
                        false,
                        'recreateCommit',
                        false
                    ),
                updated_at=now()
            WHERE
                id=$1
                AND state='PUSHED'
            RETURNING *
            `,
            [
                lifecycleId
            ]
        );


    if (
        result.rowCount
        !==
        1
    ) {

        throw new Error(
            'VERIFIED_PERSISTENCE_FAILED'
        );

    }


    return result.rows[0];

}

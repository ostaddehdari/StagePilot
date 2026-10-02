import {
    Pool
} from 'pg';

import {
    canonicalRequestFingerprint
} from './repository-request-policy.mjs';

import {
    processRepositoryRequest
} from './repository-request-orchestrator.mjs';

import {
    createRepository,
    deleteRepository,
    getRepository
} from './github-api-client.mjs';


const owner =
    process.env.STAGEPILOT_GITHUB_OWNER
    ??
    'ostaddehdari';


const secretRef =
    process.env.STAGEPILOT_GITHUB_API_SECRET_REF;


const accessProfileId =
    process.env.STAGEPILOT_GITHUB_PROFILE_ID;


if (
    process.env.STAGEPILOT_LIVE_GITHUB_ACCEPTANCE
    !==
    '1'
) {

    throw new Error(
        'LIVE_GITHUB_ACCEPTANCE_NOT_ENABLED'
    );

}


if (
    !secretRef
    ||
    !accessProfileId
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


const names = {
    create:
        `stagepilot-w02-create-${stamp}`,

    uncertain:
        `stagepilot-w02-uncertain-${stamp}`,

    attach:
        `stagepilot-w02-attach-${stamp}`
};


const projectIds = [];
const repositoriesToCleanup =
    new Set(
        Object.values(
            names
        )
    );


const report = {
    create: {},
    uncertain: {},
    attach: {},
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


async function createFixtureProject(
    label
) {

    const slug =
        `stagepilot-s06-w02-${label}-${stamp}`
            .toLowerCase();


    const result =
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
                slug,

                `StagePilot S06/W02 ${label} Acceptance`,

                'Temporary internal GitHub repository lifecycle acceptance project.',

                JSON.stringify({
                    internal:
                        true,

                    acceptanceOnly:
                        true,

                    stage:
                        'S06',

                    work:
                        'W02'
                })
            ]
        );


    const id =
        result.rows[0].id;


    projectIds.push(
        id
    );


    return id;

}


async function insertRequest({
    projectId,
    mode,
    repositoryName,
    status
}) {

    const fingerprint =
        canonicalRequestFingerprint({
            mode,
            owner,
            repositoryName,
            visibility:
                'private',
            defaultBranch:
                'main'
        });


    const approved =
        [
            'approved',
            'executing',
            'uncertain'
        ].includes(
            status
        );


    const result =
        await db.query(
            `
            INSERT INTO github_repository_requests (
                request_key,
                project_id,
                access_profile_id,
                mode,
                owner_login,
                repository_name,
                visibility,
                default_branch,
                request_fingerprint,
                status,
                approved_at,
                result_json
            )
            VALUES (
                $1,
                $2,
                $3,
                $4,
                $5,
                $6,
                'private',
                'main',
                $7,
                $8,
                CASE
                    WHEN $9::boolean
                        THEN now()
                    ELSE NULL
                END,
                $10::jsonb
            )
            RETURNING id
            `,
            [
                `s06-w02-live-${mode}-${repositoryName}`,

                projectId,

                accessProfileId,

                mode,

                owner,

                repositoryName,

                fingerprint,

                status,

                approved,

                JSON.stringify({
                    liveAcceptance:
                        true,

                    explicitApproval:
                        approved
                })
            ]
        );


    return result.rows[0].id;

}


async function requestState(
    requestId
) {

    const result =
        await db.query(
            `
            SELECT
                status,
                github_repository_id,
                result_json
            FROM github_repository_requests
            WHERE id=$1
            `,
            [
                requestId
            ]
        );


    return result.rows[0];

}


async function bindingState(
    projectId
) {

    const result =
        await db.query(
            `
            SELECT *
            FROM github_project_repositories
            WHERE project_id=$1
            `,
            [
                projectId
            ]
        );


    return result.rows[0]
        ??
        null;

}


async function ensureRepositoryAbsent(
    repositoryName
) {

    const lookup =
        await getRepository(
            secretRef,
            owner,
            repositoryName
        );


    requireCondition(
        lookup.status
        ===
        404,

        `TEMP_REPOSITORY_ALREADY_EXISTS:${repositoryName}`
    );

}


async function createExternalFixtureRepository(
    repositoryName
) {

    await ensureRepositoryAbsent(
        repositoryName
    );


    const created =
        await createRepository(
            secretRef,
            {
                name:
                    repositoryName,

                description:
                    'Temporary StagePilot S06/W02 live acceptance repository.',

                isPrivate:
                    true
            }
        );


    requireCondition(
        created.status
        ===
        201,

        `FIXTURE_REPOSITORY_CREATE_FAILED:${repositoryName}:${created.status}`
    );


    requireCondition(
        created.data?.private
        ===
        true,

        `FIXTURE_REPOSITORY_NOT_PRIVATE:${repositoryName}`
    );


    return created.data;

}


async function cleanupRepository(
    repositoryName
) {

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
        `CLEANUP_LOOKUP_FAILED:${repositoryName}:${lookup.status}`
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
        `CLEANUP_DELETE_FAILED:${repositoryName}:${deleted.status}`
    );


    for (
        let attempt = 1;
        attempt <= 8;
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
        `CLEANUP_DELETE_NOT_CONFIRMED:${repositoryName}`
    );

}


let mainError =
    null;


try {

    // ========================================================
    // A. REAL CREATE + EXACTLY-ONCE REPLAY
    // ========================================================

    await ensureRepositoryAbsent(
        names.create
    );


    const createProjectId =
        await createFixtureProject(
            'create'
        );


    const createRequestId =
        await insertRequest({
            projectId:
                createProjectId,

            mode:
                'create',

            repositoryName:
                names.create,

            status:
                'approved'
        });


    const createResult =
        await processRepositoryRequest({
            db,
            requestId:
                createRequestId,
            secretRef
        });


    requireCondition(
        createResult.outcome
        ===
        'created',

        `CREATE_OUTCOME_INVALID:${createResult.outcome}`
    );


    requireCondition(
        createResult.mutationAttempted
        ===
        true,

        'CREATE_MUTATION_NOT_RECORDED'
    );


    const createState =
        await requestState(
            createRequestId
        );


    const createBinding =
        await bindingState(
            createProjectId
        );


    requireCondition(
        createState.status
        ===
        'succeeded',

        'CREATE_REQUEST_NOT_SUCCEEDED'
    );


    requireCondition(
        Boolean(
            createBinding
        ),

        'CREATE_BINDING_MISSING'
    );


    const replayResult =
        await processRepositoryRequest({
            db,
            requestId:
                createRequestId,
            secretRef
        });


    requireCondition(
        replayResult.outcome
        ===
        'existing_binding',

        `CREATE_REPLAY_NOT_IDEMPOTENT:${replayResult.outcome}`
    );


    requireCondition(
        replayResult.mutationAttempted
        ===
        false,

        'CREATE_REPLAY_ATTEMPTED_MUTATION'
    );


    const createRemote =
        await getRepository(
            secretRef,
            owner,
            names.create
        );


    requireCondition(
        createRemote.ok,
        'CREATED_REPOSITORY_NOT_FOUND'
    );


    requireCondition(
        String(
            createRemote.data?.id
        )
        ===
        String(
            createBinding.github_repository_id
        ),

        'CREATED_REPOSITORY_ID_MISMATCH'
    );


    report.create = {
        created:
            true,

        requestSucceeded:
            true,

        bindingPersisted:
            true,

        replayOutcome:
            replayResult.outcome,

        replayMutationAttempted:
            replayResult.mutationAttempted,

        exactlyOnce:
            true
    };


    // ========================================================
    // B. SIMULATED RESPONSE LOSS -> UNCERTAIN RECONCILIATION
    // ========================================================

    const uncertainRemote =
        await createExternalFixtureRepository(
            names.uncertain
        );


    const uncertainProjectId =
        await createFixtureProject(
            'uncertain'
        );


    const uncertainRequestId =
        await insertRequest({
            projectId:
                uncertainProjectId,

            mode:
                'create',

            repositoryName:
                names.uncertain,

            status:
                'uncertain'
        });


    const uncertainResult =
        await processRepositoryRequest({
            db,
            requestId:
                uncertainRequestId,
            secretRef
        });


    requireCondition(
        uncertainResult.outcome
        ===
        'reconciled',

        `UNCERTAIN_NOT_RECONCILED:${uncertainResult.outcome}`
    );


    requireCondition(
        uncertainResult.mutationAttempted
        ===
        false,

        'UNCERTAIN_RECONCILIATION_ATTEMPTED_SECOND_CREATE'
    );


    const uncertainState =
        await requestState(
            uncertainRequestId
        );


    const uncertainBinding =
        await bindingState(
            uncertainProjectId
        );


    requireCondition(
        uncertainState.status
        ===
        'succeeded',

        'UNCERTAIN_REQUEST_NOT_RECOVERED'
    );


    requireCondition(
        String(
            uncertainBinding?.github_repository_id
        )
        ===
        String(
            uncertainRemote.id
        ),

        'UNCERTAIN_BINDING_REPOSITORY_ID_MISMATCH'
    );


    const uncertainReplay =
        await processRepositoryRequest({
            db,
            requestId:
                uncertainRequestId,
            secretRef
        });


    requireCondition(
        uncertainReplay.outcome
        ===
        'existing_binding',

        'UNCERTAIN_REPLAY_NOT_STABLE'
    );


    report.uncertain = {
        simulatedPostCreateResponseLoss:
            true,

        reconciliationOutcome:
            uncertainResult.outcome,

        secondCreateAttempted:
            false,

        recoveredRepositoryId:
            true,

        replayStable:
            true
    };


    // ========================================================
    // C. ATTACH EXISTING REPOSITORY
    // ========================================================

    const attachRemote =
        await createExternalFixtureRepository(
            names.attach
        );


    const attachProjectId =
        await createFixtureProject(
            'attach'
        );


    const attachRequestId =
        await insertRequest({
            projectId:
                attachProjectId,

            mode:
                'attach',

            repositoryName:
                names.attach,

            status:
                'approved'
        });


    const attachResult =
        await processRepositoryRequest({
            db,
            requestId:
                attachRequestId,
            secretRef
        });


    requireCondition(
        attachResult.outcome
        ===
        'attached',

        `ATTACH_OUTCOME_INVALID:${attachResult.outcome}`
    );


    requireCondition(
        attachResult.mutationAttempted
        ===
        false,

        'ATTACH_ATTEMPTED_REPOSITORY_CREATE'
    );


    const attachState =
        await requestState(
            attachRequestId
        );


    const attachBinding =
        await bindingState(
            attachProjectId
        );


    requireCondition(
        attachState.status
        ===
        'succeeded',

        'ATTACH_REQUEST_NOT_SUCCEEDED'
    );


    requireCondition(
        String(
            attachBinding?.github_repository_id
        )
        ===
        String(
            attachRemote.id
        ),

        'ATTACH_REPOSITORY_ID_MISMATCH'
    );


    requireCondition(
        attachBinding?.binding_mode
        ===
        'attached',

        'ATTACH_BINDING_MODE_INVALID'
    );


    requireCondition(
        attachBinding?.created_by_stagepilot
        ===
        false,

        'ATTACH_CREATED_BY_STAGEPILOT_INVALID'
    );


    const attachReplay =
        await processRepositoryRequest({
            db,
            requestId:
                attachRequestId,
            secretRef
        });


    requireCondition(
        attachReplay.outcome
        ===
        'existing_binding',

        'ATTACH_REPLAY_NOT_IDEMPOTENT'
    );


    report.attach = {
        existingRepositoryAttached:
            true,

        mutationAttempted:
            false,

        repositoryIdVerified:
            true,

        bindingMode:
            'attached',

        replayStable:
            true
    };


} catch (
    error
) {

    mainError =
        error;

} finally {

    const cleanupErrors = [];


    for (
        const repositoryName
        of repositoriesToCleanup
    ) {

        try {

            await cleanupRepository(
                repositoryName
            );

        } catch (
            error
        ) {

            cleanupErrors.push(
                String(
                    error?.message
                    ??
                    error
                )
            );

        }

    }


    for (
        const projectId
        of projectIds
    ) {

        try {

            await db.query(
                `
                DELETE FROM projects
                WHERE id=$1
                `,
                [
                    projectId
                ]
            );

        } catch (
            error
        ) {

            cleanupErrors.push(
                `DB_PROJECT_CLEANUP:${projectId}:${error?.message ?? error}`
            );

        }

    }


    let leftoverProjects =
        0;


    if (
        projectIds.length > 0
    ) {

        const result =
            await db.query(
                `
                SELECT COUNT(*)::int AS count
                FROM projects
                WHERE id=ANY($1::uuid[])
                `,
                [
                    projectIds
                ]
            );


        leftoverProjects =
            Number(
                result.rows[0]?.count
                ??
                0
            );

    }


    const repositoryCleanup = {};


    for (
        const repositoryName
        of repositoriesToCleanup
    ) {

        try {

            const lookup =
                await getRepository(
                    secretRef,
                    owner,
                    repositoryName
                );


            repositoryCleanup[
                repositoryName
            ] =
                lookup.status
                ===
                404;

        } catch {

            repositoryCleanup[
                repositoryName
            ] =
                false;

        }

    }


    report.cleanup = {
        repositoriesDeleted:
            Object.values(
                repositoryCleanup
            ).every(
                value =>
                    value
                ===
                true
            ),

        projectsDeleted:
            leftoverProjects
            ===
            0,

        cleanupErrors
    };


    db.release();

    await pool.end();


    if (
        cleanupErrors.length > 0
        ||
        report.cleanup.repositoriesDeleted
        !==
        true
        ||
        report.cleanup.projectsDeleted
        !==
        true
    ) {

        const cleanupError =
            new Error(
                `LIVE_ACCEPTANCE_CLEANUP_FAILED:${cleanupErrors.join(';')}`
            );


        if (!mainError) {

            mainError =
                cleanupError;

        }

    }

}


if (mainError) {

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

        owner,

        create:
            report.create,

        uncertain:
            report.uncertain,

        attach:
            report.attach,

        cleanup:
            report.cleanup,

        guarantees: {
            explicitApprovalBeforeMutation:
                true,

            exactlyOnceCreate:
                true,

            uncertainAutomaticRetry:
                false,

            uncertainReconciliation:
                true,

            attachDoesNotCreate:
                true,

            repositoryIdVerified:
                true
        }
    })
);

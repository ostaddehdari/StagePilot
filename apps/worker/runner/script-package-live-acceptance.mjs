import {
    access,
    readFile,
    rm
} from 'node:fs/promises';

import {
    constants as fsConstants
} from 'node:fs';

import {
    Pool
} from 'pg';

import {
    persistValidatedPackage,
    executeValidatedPackage
} from './script-package-orchestrator.mjs';


const projectId =
    process.env.STAGEPILOT_PROJECT_ID;


const workspaceRoot =
    process.env.STAGEPILOT_WORKSPACE_ROOT;


if (
    process.env.STAGEPILOT_W01B_ACCEPTANCE
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
    `s07-w01b-live-${stamp}`;


const requestMarker =
    `REQ-S07-W01B-${stamp}`;


const runKey =
    `s07-w01b-${stamp}`;


const workspace =
    `${workspaceRoot}/s07-w01-${stamp}`;


function script(
    filename,
    body
) {

    return [
        '#!/usr/bin/env bash',
        '# STAGEPILOT-PROGRAM: stagepilot',
        '# STAGEPILOT-STAGE: S07',
        '# STAGEPILOT-WORK: W01',
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
            'W01',

        run_key:
            runKey
    },

    files: [
        {
            filename:
                '01-base.sh',

            dependencies:
                [],

            content:
                script(
                    '01-base.sh',
                    [
                        'printf "base-success\\n" > base.marker',
                        'echo BASE_OK'
                    ].join(
                        '\n'
                    )
                )
        },

        {
            filename:
                '02-fail.sh',

            dependencies: [
                '01-base.sh'
            ],

            content:
                script(
                    '02-fail.sh',
                    [
                        'echo FAILING_AS_DESIGNED >&2',
                        'exit 23'
                    ].join(
                        '\n'
                    )
                )
        },

        {
            filename:
                '03-dependent.sh',

            dependencies: [
                '02-fail.sh'
            ],

            content:
                script(
                    '03-dependent.sh',
                    [
                        'printf "THIS_MUST_NOT_EXIST\\n" > forbidden-dependent.marker',
                        'echo SHOULD_NOT_RUN'
                    ].join(
                        '\n'
                    )
                )
        },

        {
            filename:
                '04-independent.sh',

            dependencies: [
                '01-base.sh'
            ],

            content:
                script(
                    '04-independent.sh',
                    [
                        'printf "independent-success\\n" > independent.marker',
                        'echo INDEPENDENT_OK'
                    ].join(
                        '\n'
                    )
                )
        }
    ]
};


let packageId =
    null;


let mainError =
    null;


const report = {
    durable: {},
    execution: {},
    cleanup: {}
};


try {

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


    if (
        persisted.package.package_status
        !==
        'ready'
    ) {

        throw new Error(
            'PACKAGE_NOT_READY_AFTER_PERSIST'
        );

    }


    if (
        persisted.files.length
        !==
        4
    ) {

        throw new Error(
            'EXPECTED_FOUR_DURABLE_FILES'
        );

    }


    if (
        persisted.files.some(
            file =>
                file.file_status
                !==
                'ready'
        )
    ) {

        throw new Error(
            'DURABLE_FILE_NOT_READY_BEFORE_EXECUTION'
        );

    }


    const outcomeCountBefore =
        await pool.query(
            `
            SELECT COUNT(*)::integer AS count
            FROM script_package_file_outcomes
            WHERE package_id=$1::uuid
            `,
            [
                packageId
            ]
        );


    if (
        Number(
            outcomeCountBefore.rows[0]?.count
            ??
            0
        )
        !==
        0
    ) {

        throw new Error(
            'OUTCOME_EXISTS_BEFORE_FIRST_EXECUTION'
        );

    }


    const execution =
        await executeValidatedPackage({
            db:
                pool,

            packageRecord:
                persisted.package,

            manifest:
                persisted.manifest,

            workspacePath:
                workspace
        });


    const outcomes =
        execution.outcomes;


    if (
        outcomes[
            '01-base.sh'
        ]
        !==
        'success'
    ) {

        throw new Error(
            'BASE_SCRIPT_DID_NOT_SUCCEED'
        );

    }


    if (
        outcomes[
            '02-fail.sh'
        ]
        !==
        'failed'
    ) {

        throw new Error(
            'FAIL_SCRIPT_DID_NOT_FAIL'
        );

    }


    if (
        outcomes[
            '03-dependent.sh'
        ]
        !==
        'blocked'
    ) {

        throw new Error(
            'DEPENDENT_SCRIPT_NOT_BLOCKED'
        );

    }


    if (
        outcomes[
            '04-independent.sh'
        ]
        !==
        'success'
    ) {

        throw new Error(
            'INDEPENDENT_SCRIPT_DID_NOT_CONTINUE'
        );

    }


    const failedRow =
        execution.outcomeRows.find(
            row =>
                row.filename
                ===
                '02-fail.sh'
        );


    if (
        Number(
            failedRow?.exit_code
        )
        !==
        23
    ) {

        throw new Error(
            'FAILED_EXIT_CODE_NOT_PRESERVED'
        );

    }


    const blockedRow =
        execution.outcomeRows.find(
            row =>
                row.filename
                ===
                '03-dependent.sh'
        );


    if (
        blockedRow?.started_at
        !==
        null
        ||
        blockedRow?.exit_code
        !==
        null
        ||
        blockedRow?.result_json?.executed
        !==
        false
    ) {

        throw new Error(
            'BLOCKED_SCRIPT_WAS_EXECUTED'
        );

    }


    let dependentMarkerExists =
        false;


    try {

        await access(
            `${workspace}/forbidden-dependent.marker`,
            fsConstants.F_OK
        );

        dependentMarkerExists =
            true;

    } catch {

        dependentMarkerExists =
            false;

    }


    if (
        dependentMarkerExists
    ) {

        throw new Error(
            'BLOCKED_DEPENDENT_CREATED_MARKER'
        );

    }


    const baseMarker =
        await readFile(
            `${workspace}/base.marker`,
            'utf8'
        );


    const independentMarker =
        await readFile(
            `${workspace}/independent.marker`,
            'utf8'
        );


    if (
        baseMarker.trim()
        !==
        'base-success'
    ) {

        throw new Error(
            'BASE_MARKER_INVALID'
        );

    }


    if (
        independentMarker.trim()
        !==
        'independent-success'
    ) {

        throw new Error(
            'INDEPENDENT_MARKER_INVALID'
        );

    }


    const timingResult =
        await pool.query(
            `
            SELECT
                p.validated_at,
                MIN(o.started_at) FILTER (
                    WHERE o.started_at IS NOT NULL
                ) AS first_started_at,
                COUNT(f.id)::integer AS durable_file_count,
                COUNT(o.id)::integer AS outcome_count
            FROM script_packages p
            JOIN script_package_files f
                ON f.package_id=p.id
            LEFT JOIN script_package_file_outcomes o
                ON
                    o.package_id=f.package_id
                    AND o.file_id=f.id
            WHERE p.id=$1::uuid
            GROUP BY p.id
            `,
            [
                packageId
            ]
        );


    const timing =
        timingResult.rows[0];


    if (
        !timing?.validated_at
        ||
        !timing?.first_started_at
    ) {

        throw new Error(
            'VALIDATION_EXECUTION_TIMESTAMPS_MISSING'
        );

    }


    if (
        new Date(
            timing.first_started_at
        ).getTime()
        <
        new Date(
            timing.validated_at
        ).getTime()
    ) {

        throw new Error(
            'EXECUTION_STARTED_BEFORE_VALIDATION'
        );

    }


    if (
        Number(
            timing.durable_file_count
        )
        !==
        4
        ||
        Number(
            timing.outcome_count
        )
        !==
        4
    ) {

        throw new Error(
            'DURABLE_EXECUTION_COUNT_INVALID'
        );

    }


    const finalPackage =
        await pool.query(
            `
            SELECT
                package_status,
                validation_json
            FROM script_packages
            WHERE id=$1::uuid
            `,
            [
                packageId
            ]
        );


    if (
        finalPackage.rows[0]?.package_status
        !==
        'blocked'
    ) {

        throw new Error(
            'FAILED_PACKAGE_NOT_MARKED_BLOCKED'
        );

    }


    report.durable = {
        packagePersistedBeforeExecution:
            true,

        allFilesValidated:
            true,

        durableFilesBeforeExecution:
            4,

        outcomesBeforeExecution:
            0,

        validationCompletedBeforeFirstExecution:
            true,

        manifestSha256:
            persisted.manifest.manifestSha256
    };


    report.execution = {
        executionOrder:
            persisted.manifest.executionOrder,

        base:
            'success',

        failed:
            'failed',

        failedExitCode:
            23,

        dependent:
            'blocked',

        dependentExecuted:
            false,

        dependentMarkerCreated:
            false,

        independent:
            'success',

        independentContinued:
            true,

        outcomeRows:
            4,

        finalPackageStatus:
            'blocked'
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
            workspace.startsWith(
                `${workspaceRoot}/s07-w01-`
            )
        ) {

            await rm(
                workspace,
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

        workspaceDeleted:
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

        durable:
            report.durable,

        execution:
            report.execution,

        cleanup:
            report.cleanup
    })
);

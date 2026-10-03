import {
    createHash
} from 'node:crypto';

import {
    mkdir,
    rm,
    writeFile,
    chmod
} from 'node:fs/promises';

import {
    join,
    resolve
} from 'node:path';

import {
    spawn
} from 'node:child_process';

import {
    validateScriptPackage,
    evaluateDependencyGate,
    propagateDependencyFailure
} from './script-package-contract.mjs';


function sha256(
    value
) {

    return createHash(
        'sha256'
    )
        .update(
            String(
                value
                ??
                ''
            ),
            'utf8'
        )
        .digest(
            'hex'
        );

}


export function parseStrictResponse(
    rawResponse
) {

    if (
        typeof rawResponse
        ===
        'string'
    ) {

        const trimmed =
            rawResponse.trim();


        if (!trimmed) {

            throw new Error(
                'RESPONSE_EMPTY'
            );

        }


        let parsed;


        try {

            parsed =
                JSON.parse(
                    trimmed
                );

        } catch {

            throw new Error(
                'RESPONSE_JSON_INVALID'
            );

        }


        if (
            parsed === null
            ||
            Array.isArray(
                parsed
            )
            ||
            typeof parsed
            !==
            'object'
        ) {

            throw new Error(
                'RESPONSE_OBJECT_REQUIRED'
            );

        }


        return parsed;

    }


    if (
        rawResponse
        &&
        typeof rawResponse
        ===
        'object'
        &&
        !Array.isArray(
            rawResponse
        )
    ) {

        return structuredClone(
            rawResponse
        );

    }


    throw new Error(
        'RESPONSE_OBJECT_REQUIRED'
    );

}


export async function persistValidatedPackage({

    db,
    projectId,
    packageKey,
    rawResponse,
    expectedRequestMarker

}) {

    const parsed =
        parseStrictResponse(
            rawResponse
        );


    const manifest =
        validateScriptPackage(
            parsed,
            {
                expectedRequestMarker
            }
        );


    const client =
        await db.connect();


    try {

        await client.query(
            'BEGIN'
        );


        const packageResult =
            await client.query(
                `
                INSERT INTO script_packages (
                    package_key,
                    project_id,
                    stage_key,
                    work_key,
                    run_key,
                    program_id,
                    response_type,
                    request_marker,
                    package_status,
                    manifest_sha256,
                    validation_json,
                    validated_at
                )
                VALUES (
                    $1::text,
                    $2::uuid,
                    $3::text,
                    $4::text,
                    $5::text,
                    $6::text,
                    $7::text,
                    $8::text,
                    $9::text,
                    $10::text,
                    $11::jsonb,
                    now()
                )
                RETURNING *
                `,
                [
                    packageKey,

                    projectId,

                    manifest.program.stageKey,

                    manifest.program.workKey,

                    manifest.program.runKey,

                    manifest.program.id,

                    manifest.responseType,

                    manifest.requestMarker,

                    manifest.executable
                        ? 'ready'
                        : 'validated',

                    manifest.manifestSha256,

                    JSON.stringify({
                        allFilesValidated:
                            manifest.allFilesValidated,

                        executable:
                            manifest.executable,

                        fileCount:
                            manifest.files.length,

                        executionOrder:
                            manifest.executionOrder,

                        validationCompletedBeforeExecution:
                            true
                    })
                ]
            );


        const packageRow =
            packageResult.rows[0];


        const fileRows = [];


        for (
            const file
            of manifest.files
        ) {

            const fileResult =
                await client.query(
                    `
                    INSERT INTO script_package_files (
                        package_id,
                        ordinal,
                        filename,
                        content_sha256,
                        dependencies,
                        header_json,
                        file_status
                    )
                    VALUES (
                        $1::uuid,
                        $2::integer,
                        $3::text,
                        $4::text,
                        $5::text[],
                        $6::jsonb,
                        'ready'
                    )
                    RETURNING *
                    `,
                    [
                        packageRow.id,

                        file.ordinal,

                        file.filename,

                        file.contentSha256,

                        file.dependencies,

                        JSON.stringify(
                            file.header
                        )
                    ]
                );


            fileRows.push(
                fileResult.rows[0]
            );

        }


        await client.query(
            'COMMIT'
        );


        return {
            manifest,
            package:
                packageRow,
            files:
                fileRows
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


function runBash(
    workspace,
    filename,
    environment
) {

    return new Promise(
        (
            resolvePromise,
            rejectPromise
        ) => {

            const startedAt =
                new Date();


            const child =
                spawn(
                    '/bin/bash',
                    [
                        join(
                            workspace,
                            filename
                        )
                    ],
                    {
                        cwd:
                            workspace,

                        env: {
                            PATH:
                                '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',

                            HOME:
                                workspace,

                            LANG:
                                'C.UTF-8',

                            LC_ALL:
                                'C.UTF-8',

                            ...environment
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
                        startedAt,

                        completedAt:
                            new Date(),

                        exitCode:
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


async function syntaxCheck(
    workspace,
    filename
) {

    return new Promise(
        (
            resolvePromise,
            rejectPromise
        ) => {

            const child =
                spawn(
                    '/bin/bash',
                    [
                        '-n',
                        join(
                            workspace,
                            filename
                        )
                    ],
                    {
                        cwd:
                            workspace,

                        env: {
                            PATH:
                                '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',

                            HOME:
                                workspace,

                            LANG:
                                'C.UTF-8',

                            LC_ALL:
                                'C.UTF-8'
                        },

                        stdio: [
                            'ignore',
                            'ignore',
                            'pipe'
                        ]
                    }
                );


            let stderr = '';


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
                        exitCode:
                            Number(
                                code
                                ??
                                1
                            ),

                        stderr
                    });

                }
            );

        }
    );

}


async function recordOutcome({

    db,
    packageId,
    fileId,
    outcome,
    exitCode,
    startedAt,
    completedAt,
    stdout,
    stderr,
    result

}) {

    await db.query(
        `
        INSERT INTO script_package_file_outcomes (
            package_id,
            file_id,
            attempt,
            outcome,
            exit_code,
            stdout_sha256,
            stderr_sha256,
            started_at,
            completed_at,
            result_json
        )
        VALUES (
            $1::uuid,
            $2::uuid,
            1,
            $3::text,
            $4::integer,
            $5::text,
            $6::text,
            $7::timestamptz,
            $8::timestamptz,
            $9::jsonb
        )
        `,
        [
            packageId,

            fileId,

            outcome,

            exitCode,

            stdout === null
                ? null
                : sha256(
                    stdout
                ),

            stderr === null
                ? null
                : sha256(
                    stderr
                ),

            startedAt,

            completedAt,

            JSON.stringify(
                result
                ??
                {}
            )
        ]
    );

}


export async function executeValidatedPackage({

    db,
    packageRecord,
    manifest,
    workspacePath

}) {

    if (
        manifest?.allFilesValidated
        !==
        true
        ||
        manifest?.executable
        !==
        true
    ) {

        throw new Error(
            'PACKAGE_NOT_EXECUTABLE'
        );

    }


    const workspace =
        resolve(
            String(
                workspacePath
            )
        );


    const packageQuery =
        await db.query(
            `
            SELECT *
            FROM script_packages
            WHERE id=$1::uuid
            LIMIT 1
            `,
            [
                packageRecord.id
            ]
        );


    if (
        packageQuery.rowCount
        !==
        1
    ) {

        throw new Error(
            'PACKAGE_NOT_FOUND'
        );

    }


    const durablePackage =
        packageQuery.rows[0];


    if (
        durablePackage.package_status
        !==
        'ready'
    ) {

        throw new Error(
            'PACKAGE_NOT_READY'
        );

    }


    if (
        durablePackage.manifest_sha256
        !==
        manifest.manifestSha256
    ) {

        throw new Error(
            'PACKAGE_MANIFEST_HASH_MISMATCH'
        );

    }


    const fileQuery =
        await db.query(
            `
            SELECT *
            FROM script_package_files
            WHERE package_id=$1::uuid
            ORDER BY ordinal
            `,
            [
                durablePackage.id
            ]
        );


    if (
        fileQuery.rowCount
        !==
        manifest.files.length
    ) {

        throw new Error(
            'DURABLE_FILE_COUNT_MISMATCH'
        );

    }


    const durableByName =
        new Map(
            fileQuery.rows.map(
                row => [
                    row.filename,
                    row
                ]
            )
        );


    for (
        const file
        of manifest.files
    ) {

        const durable =
            durableByName.get(
                file.filename
            );


        if (!durable) {

            throw new Error(
                `DURABLE_FILE_MISSING:${file.filename}`
            );

        }


        if (
            durable.file_status
            !==
            'ready'
        ) {

            throw new Error(
                `DURABLE_FILE_NOT_READY:${file.filename}`
            );

        }


        if (
            durable.content_sha256
            !==
            file.contentSha256
        ) {

            throw new Error(
                `DURABLE_FILE_HASH_MISMATCH:${file.filename}`
            );

        }


        if (
            JSON.stringify(
                durable.dependencies
            )
            !==
            JSON.stringify(
                file.dependencies
            )
        ) {

            throw new Error(
                `DURABLE_DEPENDENCY_MISMATCH:${file.filename}`
            );

        }

    }


    const existingOutcomes =
        await db.query(
            `
            SELECT COUNT(*)::integer AS count
            FROM script_package_file_outcomes
            WHERE package_id=$1::uuid
            `,
            [
                durablePackage.id
            ]
        );


    if (
        Number(
            existingOutcomes.rows[0]?.count
            ??
            0
        )
        !==
        0
    ) {

        throw new Error(
            'PACKAGE_ALREADY_EXECUTED'
        );

    }


    await rm(
        workspace,
        {
            recursive:
                true,

            force:
                true
        }
    );


    await mkdir(
        workspace,
        {
            recursive:
                true
        }
    );


    for (
        const file
        of manifest.files
    ) {

        const content =
            manifest.contents[
                file.filename
            ];


        if (
            sha256(
                content
            )
            !==
            file.contentSha256
        ) {

            throw new Error(
                `CONTENT_HASH_CHANGED_BEFORE_WRITE:${file.filename}`
            );

        }


        const path =
            join(
                workspace,
                file.filename
            );


        await writeFile(
            path,
            content,
            'utf8'
        );


        await chmod(
            path,
            0o700
        );

    }


    // Every file receives bash -n before the first execution.
    for (
        const filename
        of manifest.executionOrder
    ) {

        const check =
            await syntaxCheck(
                workspace,
                filename
            );


        if (
            check.exitCode
            !==
            0
        ) {

            throw new Error(
                `PACKAGE_SYNTAX_PREFLIGHT_FAILED:${filename}`
            );

        }

    }


    const durablePreflight =
        await db.query(
            `
            SELECT
                p.package_status,
                p.validated_at,
                p.validation_json,
                COUNT(f.id)::integer AS file_count,
                bool_and(
                    f.file_status='ready'
                ) AS every_file_ready
            FROM script_packages p
            JOIN script_package_files f
                ON f.package_id=p.id
            WHERE p.id=$1::uuid
            GROUP BY
                p.id,
                p.package_status,
                p.validated_at,
                p.validation_json
            `,
            [
                durablePackage.id
            ]
        );


    if (
        durablePreflight.rowCount
        !==
        1
    ) {

        throw new Error(
            'DURABLE_PREFLIGHT_QUERY_FAILED'
        );

    }


    const preflight =
        durablePreflight.rows[0];


    if (
        preflight.package_status
        !==
        'ready'
        ||
        preflight.every_file_ready
        !==
        true
        ||
        Number(
            preflight.file_count
        )
        !==
        manifest.files.length
        ||
        preflight.validation_json?.allFilesValidated
        !==
        true
    ) {

        throw new Error(
            'ALL_FILES_NOT_VALIDATED_BEFORE_FIRST_EXECUTION'
        );

    }


    const outcomes = {};


    const executionTrace = [];


    for (
        const filename
        of manifest.executionOrder
    ) {

        const file =
            manifest.files.find(
                item =>
                    item.filename
                    ===
                    filename
            );


        const durable =
            durableByName.get(
                filename
            );


        const gate =
            evaluateDependencyGate({
                manifest,
                filename,
                outcomes
            });


        if (
            gate.allowed
            !==
            true
        ) {

            outcomes[
                filename
            ] =
                'blocked';


            await db.query(
                `
                UPDATE script_package_files
                SET
                    file_status='blocked',
                    error_json=
                        jsonb_build_object(
                            'reason',
                            $3::text,
                            'dependency',
                            $4::text
                        ),
                    updated_at=now()
                WHERE
                    id=$1::uuid
                    AND package_id=$2::uuid
                `,
                [
                    durable.id,
                    durablePackage.id,
                    gate.reason,
                    gate.dependency
                    ??
                    ''
                ]
            );


            await recordOutcome({
                db,

                packageId:
                    durablePackage.id,

                fileId:
                    durable.id,

                outcome:
                    'blocked',

                exitCode:
                    null,

                startedAt:
                    null,

                completedAt:
                    new Date(),

                stdout:
                    null,

                stderr:
                    null,

                result: {
                    executed:
                        false,

                    reason:
                        gate.reason,

                    dependency:
                        gate.dependency
                        ??
                        null
                }
            });


            executionTrace.push({
                filename,
                outcome:
                    'blocked',
                executed:
                    false
            });


            continue;

        }


        const result =
            await runBash(
                workspace,
                filename,
                {
                    STAGEPILOT_PROGRAM_ID:
                        manifest.program.id,

                    STAGEPILOT_STAGE_KEY:
                        manifest.program.stageKey,

                    STAGEPILOT_WORK_KEY:
                        manifest.program.workKey,

                    STAGEPILOT_RUN_KEY:
                        manifest.program.runKey,

                    STAGEPILOT_FILE:
                        filename
                }
            );


        if (
            result.exitCode
            ===
            0
        ) {

            outcomes[
                filename
            ] =
                'success';


            await recordOutcome({
                db,

                packageId:
                    durablePackage.id,

                fileId:
                    durable.id,

                outcome:
                    'success',

                exitCode:
                    result.exitCode,

                startedAt:
                    result.startedAt,

                completedAt:
                    result.completedAt,

                stdout:
                    result.stdout,

                stderr:
                    result.stderr,

                result: {
                    executed:
                        true,

                    success:
                        true
                }
            });


            executionTrace.push({
                filename,
                outcome:
                    'success',
                executed:
                    true,
                exitCode:
                    result.exitCode
            });


            continue;

        }


        outcomes[
            filename
        ] =
            'failed';


        await db.query(
            `
            UPDATE script_package_files
            SET
                file_status='failed',
                error_json=
                    jsonb_build_object(
                        'reason',
                        'SCRIPT_EXIT_NONZERO',
                        'exitCode',
                        $3::integer
                    ),
                updated_at=now()
            WHERE
                id=$1::uuid
                AND package_id=$2::uuid
            `,
            [
                durable.id,
                durablePackage.id,
                result.exitCode
            ]
        );


        await recordOutcome({
            db,

            packageId:
                durablePackage.id,

            fileId:
                durable.id,

            outcome:
                'failed',

            exitCode:
                result.exitCode,

            startedAt:
                result.startedAt,

            completedAt:
                result.completedAt,

            stdout:
                result.stdout,

            stderr:
                result.stderr,

            result: {
                executed:
                    true,

                success:
                    false,

                exitCode:
                    result.exitCode
            }
        });


        executionTrace.push({
            filename,
            outcome:
                'failed',
            executed:
                true,
            exitCode:
                result.exitCode
        });


        const propagated =
            propagateDependencyFailure({
                manifest,
                failedFilename:
                    filename,
                outcomes
            });


        for (
            const [
                propagatedFilename,
                propagatedOutcome
            ]
            of Object.entries(
                propagated
            )
        ) {

            if (
                outcomes[
                    propagatedFilename
                ]
                ===
                undefined
                &&
                propagatedOutcome
                ===
                'blocked'
            ) {

                outcomes[
                    propagatedFilename
                ] =
                    'blocked';

            }

        }

    }


    const hasFailure =
        Object.values(
            outcomes
        ).some(
            outcome =>
                outcome
                ===
                'failed'
                ||
                outcome
                ===
                'blocked'
        );


    await db.query(
        `
        UPDATE script_packages
        SET
            package_status=$2::text,
            validation_json=
                validation_json
                ||
                $3::jsonb,
            updated_at=now()
        WHERE id=$1::uuid
        `,
        [
            durablePackage.id,

            hasFailure
                ? 'blocked'
                : 'ready',

            JSON.stringify({
                executionCompleted:
                    true,

                outcomes,

                executionTrace
            })
        ]
    );


    const outcomeRows =
        await db.query(
            `
            SELECT
                f.filename,
                o.outcome,
                o.exit_code,
                o.started_at,
                o.completed_at,
                o.result_json
            FROM script_package_file_outcomes o
            JOIN script_package_files f
                ON
                    f.id=o.file_id
                    AND f.package_id=o.package_id
            WHERE o.package_id=$1::uuid
            ORDER BY f.ordinal
            `,
            [
                durablePackage.id
            ]
        );


    return {
        outcomes,
        executionTrace,
        outcomeRows:
            outcomeRows.rows,
        validatedAt:
            durablePackage.validated_at,
        preflightCompletedBeforeExecution:
            true
    };

}

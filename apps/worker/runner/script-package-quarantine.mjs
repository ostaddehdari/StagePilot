import {
    createHash
} from 'node:crypto';

import {
    chmod,
    mkdir,
    readFile,
    readdir,
    rm,
    writeFile
} from 'node:fs/promises';

import {
    isAbsolute,
    join,
    relative,
    resolve
} from 'node:path';

import {
    spawn
} from 'node:child_process';


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


function requiredText(
    value,
    code
) {

    const text =
        String(
            value
            ??
            ''
        ).trim();


    if (!text) {

        throw new Error(
            code
        );

    }


    return text;

}


function normalizeAbsolutePath(
    value,
    code
) {

    const text =
        requiredText(
            value,
            code
        );


    if (
        !isAbsolute(
            text
        )
    ) {

        throw new Error(
            `${code}_NOT_ABSOLUTE`
        );

    }


    const normalized =
        resolve(
            text
        );


    if (
        normalized
        ===
        '/'
    ) {

        throw new Error(
            `${code}_ROOT_FORBIDDEN`
        );

    }


    return normalized;

}


export function ensureContainedPath({
    basePath,
    candidatePath
}) {

    const base =
        normalizeAbsolutePath(
            basePath,
            'BASE_PATH'
        );


    const candidate =
        normalizeAbsolutePath(
            candidatePath,
            'CANDIDATE_PATH'
        );


    const rel =
        relative(
            base,
            candidate
        );


    if (
        rel
        ===
        ''
        ||
        rel
            .split(
                /[\\/]+/
            )
            .includes(
                '..'
            )
        ||
        isAbsolute(
            rel
        )
    ) {

        throw new Error(
            'QUARANTINE_PATH_OUTSIDE_ALLOWED_ROOT'
        );

    }


    return {
        base,
        candidate
    };

}


function runBashSyntax(
    filePath,
    cwd
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
                        filePath
                    ],
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


function assertManifestReady(
    manifest
) {

    if (
        manifest?.allFilesValidated
        !==
        true
    ) {

        throw new Error(
            'PACKAGE_NOT_FULLY_VALIDATED'
        );

    }


    if (
        manifest?.executable
        !==
        true
    ) {

        throw new Error(
            'PACKAGE_NOT_EXECUTABLE'
        );

    }


    if (
        !Array.isArray(
            manifest?.files
        )
        ||
        manifest.files.length
        ===
        0
    ) {

        throw new Error(
            'PACKAGE_FILES_REQUIRED'
        );

    }


    if (
        !manifest?.contents
        ||
        typeof manifest.contents
        !==
        'object'
    ) {

        throw new Error(
            'PACKAGE_CONTENTS_REQUIRED'
        );

    }


    if (
        !/^[0-9a-f]{64}$/.test(
            String(
                manifest?.manifestSha256
                ??
                ''
            )
        )
    ) {

        throw new Error(
            'PACKAGE_MANIFEST_HASH_INVALID'
        );

    }

}


export function approvalBindingHash({

    packageId,
    manifestSha256,
    serverKey,
    workspacePath

}) {

    const binding = {
        packageId:
            requiredText(
                packageId,
                'PACKAGE_ID_REQUIRED'
            ),

        manifestSha256:
            requiredText(
                manifestSha256,
                'MANIFEST_SHA_REQUIRED'
            ),

        serverKey:
            requiredText(
                serverKey,
                'SERVER_KEY_REQUIRED'
            ),

        workspacePath:
            normalizeAbsolutePath(
                workspacePath,
                'WORKSPACE_PATH'
            )
    };


    if (
        !/^[0-9a-f]{64}$/.test(
            binding.manifestSha256
        )
    ) {

        throw new Error(
            'MANIFEST_SHA_INVALID'
        );

    }


    return sha256(
        JSON.stringify(
            binding
        )
    );

}


export async function quarantinePackage({

    manifest,
    baseQuarantineRoot,
    quarantinePath

}) {

    assertManifestReady(
        manifest
    );


    const containment =
        ensureContainedPath({
            basePath:
                baseQuarantineRoot,

            candidatePath:
                quarantinePath
        });


    const root =
        containment.candidate;


    await rm(
        root,
        {
            recursive:
                true,

            force:
                true
        }
    );


    await mkdir(
        root,
        {
            recursive:
                true,

            mode:
                0o700
        }
    );


    const expectedNames =
        manifest.files
            .map(
                file =>
                    file.filename
            )
            .sort();


    const validationFiles = [];


    for (
        const file
        of manifest.files
    ) {

        const content =
            manifest.contents[
                file.filename
            ];


        if (
            typeof content
            !==
            'string'
        ) {

            throw new Error(
                `QUARANTINE_CONTENT_MISSING:${file.filename}`
            );

        }


        const actualHash =
            sha256(
                content
            );


        if (
            actualHash
            !==
            file.contentSha256
        ) {

            throw new Error(
                `QUARANTINE_CONTENT_HASH_MISMATCH:${file.filename}`
            );

        }


        const destination =
            join(
                root,
                file.filename
            );


        await writeFile(
            destination,
            content,
            {
                encoding:
                    'utf8',

                mode:
                    0o600
            }
        );


        await chmod(
            destination,
            0o600
        );


        validationFiles.push({
            filename:
                file.filename,

            contentSha256:
                actualHash,

            path:
                destination
        });

    }


    const actualNames =
        (
            await readdir(
                root
            )
        ).sort();


    if (
        JSON.stringify(
            actualNames
        )
        !==
        JSON.stringify(
            expectedNames
        )
    ) {

        throw new Error(
            'QUARANTINE_FILE_SET_MISMATCH'
        );

    }


    for (
        const file
        of validationFiles
    ) {

        const syntax =
            await runBashSyntax(
                file.path,
                root
            );


        if (
            syntax.exitCode
            !==
            0
        ) {

            throw new Error(
                `BASH_SYNTAX_FAILED:${file.filename}`
            );

        }

    }


    return {
        quarantineRoot:
            root,

        manifestSha256:
            manifest.manifestSha256,

        fileCount:
            validationFiles.length,

        allFilesPresent:
            true,

        syntaxValid:
            true,

        integrityValid:
            true,

        executed:
            false,

        files:
            validationFiles
    };

}


export async function verifyQuarantineIntegrity({

    manifest,
    quarantinePath

}) {

    assertManifestReady(
        manifest
    );


    const root =
        normalizeAbsolutePath(
            quarantinePath,
            'QUARANTINE_PATH'
        );


    const expectedNames =
        manifest.files
            .map(
                file =>
                    file.filename
            )
            .sort();


    const actualNames =
        (
            await readdir(
                root
            )
        ).sort();


    if (
        JSON.stringify(
            actualNames
        )
        !==
        JSON.stringify(
            expectedNames
        )
    ) {

        throw new Error(
            'QUARANTINE_FILE_SET_CHANGED'
        );

    }


    for (
        const file
        of manifest.files
    ) {

        const content =
            await readFile(
                join(
                    root,
                    file.filename
                ),
                'utf8'
            );


        const currentHash =
            sha256(
                content
            );


        if (
            currentHash
            !==
            file.contentSha256
        ) {

            throw new Error(
                `QUARANTINE_FILE_HASH_MISMATCH:${file.filename}`
            );

        }


        const syntax =
            await runBashSyntax(
                join(
                    root,
                    file.filename
                ),
                root
            );


        if (
            syntax.exitCode
            !==
            0
        ) {

            throw new Error(
                `QUARANTINE_FILE_SYNTAX_CHANGED:${file.filename}`
            );

        }

    }


    return {
        integrityValid:
            true,

        syntaxValid:
            true,

        fileCount:
            manifest.files.length
    };

}


export async function persistQuarantine({

    db,
    projectId,
    packageId,
    manifest,
    quarantineResult,
    serverKey,
    workspacePath

}) {

    const workspace =
        normalizeAbsolutePath(
            workspacePath,
            'WORKSPACE_PATH'
        );


    const server =
        requiredText(
            serverKey,
            'SERVER_KEY_REQUIRED'
        );


    const result =
        await db.query(
            `
            INSERT INTO script_package_quarantines (
                package_id,
                project_id,
                manifest_sha256,
                quarantine_root,
                server_key,
                workspace_path,
                status,
                all_files_present,
                syntax_valid,
                integrity_valid,
                validation_json,
                validated_at
            )
            VALUES (
                $1::uuid,
                $2::uuid,
                $3::text,
                $4::text,
                $5::text,
                $6::text,
                'validated',
                true,
                true,
                true,
                $7::jsonb,
                now()
            )
            RETURNING *
            `,
            [
                packageId,

                projectId,

                manifest.manifestSha256,

                quarantineResult.quarantineRoot,

                server,

                workspace,

                JSON.stringify({
                    fileCount:
                        quarantineResult.fileCount,

                    allFilesPresent:
                        true,

                    syntaxValid:
                        true,

                    integrityValid:
                        true,

                    executed:
                        false,

                    sourceEvalUsed:
                        false
                })
            ]
        );


    if (
        result.rowCount
        !==
        1
    ) {

        throw new Error(
            'QUARANTINE_PERSIST_FAILED'
        );

    }


    return result.rows[0];

}


export async function approveQuarantine({

    db,
    approvalKey,
    quarantineId,
    packageId,
    manifestSha256,
    serverKey,
    workspacePath

}) {

    const workspace =
        normalizeAbsolutePath(
            workspacePath,
            'WORKSPACE_PATH'
        );


    const bindingSha256 =
        approvalBindingHash({
            packageId,
            manifestSha256,
            serverKey,
            workspacePath:
                workspace
        });


    const client =
        await db.connect();


    try {

        await client.query(
            'BEGIN'
        );


        const quarantineQuery =
            await client.query(
                `
                SELECT *
                FROM script_package_quarantines
                WHERE
                    id=$1::uuid
                    AND package_id=$2::uuid
                FOR UPDATE
                `,
                [
                    quarantineId,
                    packageId
                ]
            );


        if (
            quarantineQuery.rowCount
            !==
            1
        ) {

            throw new Error(
                'QUARANTINE_NOT_FOUND'
            );

        }


        const quarantine =
            quarantineQuery.rows[0];


        if (
            quarantine.status
            !==
            'validated'
        ) {

            throw new Error(
                'QUARANTINE_NOT_VALIDATED'
            );

        }


        if (
            quarantine.manifest_sha256
            !==
            manifestSha256
        ) {

            throw new Error(
                'APPROVAL_MANIFEST_MISMATCH'
            );

        }


        if (
            quarantine.server_key
            !==
            serverKey
        ) {

            throw new Error(
                'APPROVAL_SERVER_MISMATCH'
            );

        }


        if (
            quarantine.workspace_path
            !==
            workspace
        ) {

            throw new Error(
                'APPROVAL_WORKSPACE_MISMATCH'
            );

        }


        const approvalResult =
            await client.query(
                `
                INSERT INTO script_package_approvals (
                    approval_key,
                    quarantine_id,
                    package_id,
                    manifest_sha256,
                    server_key,
                    workspace_path,
                    binding_sha256,
                    status,
                    approval_json
                )
                VALUES (
                    $1::text,
                    $2::uuid,
                    $3::uuid,
                    $4::text,
                    $5::text,
                    $6::text,
                    $7::text,
                    'approved',
                    $8::jsonb
                )
                RETURNING *
                `,
                [
                    approvalKey,

                    quarantineId,

                    packageId,

                    manifestSha256,

                    serverKey,

                    workspace,

                    bindingSha256,

                    JSON.stringify({
                        hashBound:
                            true,

                        serverBound:
                            true,

                        workspaceBound:
                            true,

                        sourceEvalUsed:
                            false
                    })
                ]
            );


        await client.query(
            `
            UPDATE script_package_quarantines
            SET
                status='approved',
                updated_at=now()
            WHERE id=$1::uuid
            `,
            [
                quarantineId
            ]
        );


        await client.query(
            'COMMIT'
        );


        return approvalResult.rows[0];


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


export async function verifyApproval({

    db,
    approvalId,
    manifest,
    serverKey,
    workspacePath

}) {

    const workspace =
        normalizeAbsolutePath(
            workspacePath,
            'WORKSPACE_PATH'
        );


    const result =
        await db.query(
            `
            SELECT
                a.*,
                q.quarantine_root,
                q.status AS quarantine_status,
                q.integrity_valid,
                q.syntax_valid
            FROM script_package_approvals a
            JOIN script_package_quarantines q
                ON
                    q.id=a.quarantine_id
                    AND q.package_id=a.package_id
            WHERE a.id=$1::uuid
            LIMIT 1
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
            'APPROVAL_NOT_FOUND'
        );

    }


    const approval =
        result.rows[0];


    if (
        approval.status
        !==
        'approved'
    ) {

        throw new Error(
            'APPROVAL_NOT_ACTIVE'
        );

    }


    if (
        approval.quarantine_status
        !==
        'approved'
    ) {

        throw new Error(
            'QUARANTINE_NOT_APPROVED'
        );

    }


    if (
        approval.manifest_sha256
        !==
        manifest.manifestSha256
    ) {

        throw new Error(
            'APPROVAL_MANIFEST_CHANGED'
        );

    }


    if (
        approval.server_key
        !==
        serverKey
    ) {

        throw new Error(
            'APPROVAL_SERVER_CHANGED'
        );

    }


    if (
        approval.workspace_path
        !==
        workspace
    ) {

        throw new Error(
            'APPROVAL_WORKSPACE_CHANGED'
        );

    }


    const expectedBinding =
        approvalBindingHash({
            packageId:
                approval.package_id,

            manifestSha256:
                manifest.manifestSha256,

            serverKey,

            workspacePath:
                workspace
        });


    if (
        approval.binding_sha256
        !==
        expectedBinding
    ) {

        throw new Error(
            'APPROVAL_BINDING_HASH_MISMATCH'
        );

    }


    const integrity =
        await verifyQuarantineIntegrity({
            manifest,

            quarantinePath:
                approval.quarantine_root
        });


    return {
        approved:
            true,

        integrityValid:
            integrity.integrityValid,

        syntaxValid:
            integrity.syntaxValid,

        manifestSha256:
            approval.manifest_sha256,

        bindingSha256:
            approval.binding_sha256,

        quarantineRoot:
            approval.quarantine_root
    };

}

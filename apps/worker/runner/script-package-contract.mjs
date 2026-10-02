import {
    createHash
} from 'node:crypto';


const RESPONSE_TYPES =
    new Set([
        'script_batch',
        'report_only',
        'decision_required'
    ]);


const SAFE_FILENAME =
    /^[A-Za-z0-9][A-Za-z0-9._-]{0,80}\.sh$/;


const SAFE_PROGRAM_ID =
    /^[A-Za-z0-9][A-Za-z0-9._-]{0,100}$/;


const SAFE_RUN_KEY =
    /^[A-Za-z0-9][A-Za-z0-9._:-]{0,160}$/;


function requiredText(
    value,
    code
) {

    const normalized =
        String(
            value
            ??
            ''
        ).trim();


    if (!normalized) {

        throw new Error(
            code
        );

    }


    return normalized;

}


function sha256(
    value
) {

    return createHash(
        'sha256'
    )
        .update(
            value,
            'utf8'
        )
        .digest(
            'hex'
        );

}


export function normalizeStageKey(
    value
) {

    const stage =
        requiredText(
            value,
            'STAGE_KEY_REQUIRED'
        ).toUpperCase();


    if (
        !/^S[0-9]{2,4}$/.test(
            stage
        )
    ) {

        throw new Error(
            'INVALID_STAGE_KEY'
        );

    }


    return stage;

}


export function normalizeWorkKey(
    value
) {

    const work =
        requiredText(
            value,
            'WORK_KEY_REQUIRED'
        )
            .toUpperCase()
            .replace(
                '-',
                '_'
            );


    if (
        !/^W[0-9]{2,4}(?:_[A-Z0-9]+)?$/.test(
            work
        )
    ) {

        throw new Error(
            'INVALID_WORK_KEY'
        );

    }


    return work;

}


export function validateFilename(
    value
) {

    const filename =
        requiredText(
            value,
            'SCRIPT_FILENAME_REQUIRED'
        );


    if (
        filename.includes(
            '/'
        )
        ||
        filename.includes(
            '\\'
        )
        ||
        filename.includes(
            '..'
        )
        ||
        !SAFE_FILENAME.test(
            filename
        )
    ) {

        throw new Error(
            'UNSAFE_SCRIPT_FILENAME'
        );

    }


    return filename;

}


export function parseScriptHeader(
    content
) {

    const text =
        requiredText(
            content,
            'SCRIPT_CONTENT_REQUIRED'
        );


    const lines =
        text.split(
            /\r?\n/
        );


    if (
        lines[0]
        !==
        '#!/usr/bin/env bash'
        &&
        lines[0]
        !==
        '#!/bin/bash'
    ) {

        throw new Error(
            'SCRIPT_SHEBANG_INVALID'
        );

    }


    const header = {};


    const patterns = [
        [
            'programId',
            /^# STAGEPILOT-PROGRAM:\s*(.+?)\s*$/
        ],

        [
            'stageKey',
            /^# STAGEPILOT-STAGE:\s*(.+?)\s*$/
        ],

        [
            'workKey',
            /^# STAGEPILOT-WORK:\s*(.+?)\s*$/
        ],

        [
            'runKey',
            /^# STAGEPILOT-RUN:\s*(.+?)\s*$/
        ],

        [
            'filename',
            /^# STAGEPILOT-FILE:\s*(.+?)\s*$/
        ]
    ];


    const scanLines =
        lines.slice(
            1,
            20
        );


    for (
        const [
            field,
            pattern
        ]
        of patterns
    ) {

        const line =
            scanLines.find(
                candidate =>
                    pattern.test(
                        candidate
                    )
            );


        if (!line) {

            throw new Error(
                `SCRIPT_HEADER_MISSING:${field}`
            );

        }


        const match =
            line.match(
                pattern
            );


        header[
            field
        ] =
            String(
                match?.[1]
                ??
                ''
            ).trim();

    }


    return header;

}


function canonicalProgram(
    program
) {

    const id =
        requiredText(
            program?.id,
            'PROGRAM_ID_REQUIRED'
        );


    if (
        !SAFE_PROGRAM_ID.test(
            id
        )
    ) {

        throw new Error(
            'PROGRAM_ID_INVALID'
        );

    }


    const runKey =
        requiredText(
            program?.run_key
            ??
            program?.runKey,
            'RUN_KEY_REQUIRED'
        );


    if (
        !SAFE_RUN_KEY.test(
            runKey
        )
    ) {

        throw new Error(
            'RUN_KEY_INVALID'
        );

    }


    return {
        id,

        stageKey:
            normalizeStageKey(
                program?.stage_key
                ??
                program?.stageKey
            ),

        workKey:
            normalizeWorkKey(
                program?.work_key
                ??
                program?.workKey
            ),

        runKey
    };

}


function canonicalResponseType(
    response
) {

    const type =
        requiredText(
            response?.response_type
            ??
            response?.type,
            'RESPONSE_TYPE_REQUIRED'
        );


    if (
        !RESPONSE_TYPES.has(
            type
        )
    ) {

        throw new Error(
            'RESPONSE_TYPE_INVALID'
        );

    }


    return type;

}


function canonicalFiles(
    response
) {

    const value =
        response?.files
        ??
        response?.scripts
        ??
        [];


    if (
        !Array.isArray(
            value
        )
    ) {

        throw new Error(
            'SCRIPT_FILES_MUST_BE_ARRAY'
        );

    }


    return value;

}


function validateDependencies({
    files,
    filenameSet
}) {

    for (
        const file
        of files
    ) {

        const seen =
            new Set();


        for (
            const dependency
            of file.dependencies
        ) {

            if (
                dependency
                ===
                file.filename
            ) {

                throw new Error(
                    `SCRIPT_SELF_DEPENDENCY:${file.filename}`
                );

            }


            if (
                seen.has(
                    dependency
                )
            ) {

                throw new Error(
                    `SCRIPT_DUPLICATE_DEPENDENCY:${file.filename}`
                );

            }


            seen.add(
                dependency
            );


            if (
                !filenameSet.has(
                    dependency
                )
            ) {

                throw new Error(
                    `SCRIPT_DEPENDENCY_MISSING:${file.filename}:${dependency}`
                );

            }

        }

    }

}


function topologicalSort(
    files
) {

    const byName =
        new Map(
            files.map(
                file => [
                    file.filename,
                    file
                ]
            )
        );


    const state =
        new Map();


    const output = [];


    function visit(
        filename,
        trail
    ) {

        const current =
            state.get(
                filename
            )
            ??
            'new';


        if (
            current
            ===
            'done'
        ) {

            return;

        }


        if (
            current
            ===
            'visiting'
        ) {

            throw new Error(
                `SCRIPT_DEPENDENCY_CYCLE:${[
                    ...trail,
                    filename
                ].join('>')}`
            );

        }


        state.set(
            filename,
            'visiting'
        );


        const file =
            byName.get(
                filename
            );


        for (
            const dependency
            of file.dependencies
        ) {

            visit(
                dependency,
                [
                    ...trail,
                    filename
                ]
            );

        }


        state.set(
            filename,
            'done'
        );


        output.push(
            filename
        );

    }


    for (
        const file
        of files
    ) {

        visit(
            file.filename,
            []
        );

    }


    return output;

}


export function validateScriptPackage(
    response,
    {
        expectedRequestMarker
    } = {}
) {

    const responseType =
        canonicalResponseType(
            response
        );


    const requestMarker =
        requiredText(
            response?.request_marker
            ??
            response?.requestMarker,
            'REQUEST_MARKER_REQUIRED'
        );


    if (
        expectedRequestMarker !== undefined
        &&
        requestMarker
        !==
        String(
            expectedRequestMarker
        )
    ) {

        throw new Error(
            'REQUEST_MARKER_MISMATCH'
        );

    }


    const program =
        canonicalProgram(
            response?.program
        );


    const sourceFiles =
        canonicalFiles(
            response
        );


    if (
        responseType
        !==
        'script_batch'
    ) {

        if (
            sourceFiles.length
            !==
            0
        ) {

            throw new Error(
                'NON_SCRIPT_RESPONSE_MUST_NOT_INCLUDE_FILES'
            );

        }


        const canonical = {
            responseType,

            requestMarker,

            program,

            files:
                [],

            executionOrder:
                []
        };


        const manifestSha256 =
            sha256(
                JSON.stringify(
                    canonical
                )
            );


        return {
            ...canonical,
            manifestSha256,
            allFilesValidated:
                true,
            executable:
                false
        };

    }


    if (
        sourceFiles.length
        ===
        0
    ) {

        throw new Error(
            'SCRIPT_BATCH_EMPTY'
        );

    }


    if (
        sourceFiles.length
        >
        50
    ) {

        throw new Error(
            'SCRIPT_BATCH_TOO_LARGE'
        );

    }


    const files = [];


    const filenameSet =
        new Set();


    for (
        let index = 0;
        index < sourceFiles.length;
        index += 1
    ) {

        const source =
            sourceFiles[
                index
            ];


        const filename =
            validateFilename(
                source?.filename
                ??
                source?.name
            );


        if (
            filenameSet.has(
                filename
            )
        ) {

            throw new Error(
                `SCRIPT_FILENAME_DUPLICATE:${filename}`
            );

        }


        filenameSet.add(
            filename
        );


        const content =
            requiredText(
                source?.content,
                `SCRIPT_CONTENT_REQUIRED:${filename}`
            );


        const header =
            parseScriptHeader(
                content
            );


        if (
            header.programId
            !==
            program.id
        ) {

            throw new Error(
                `SCRIPT_HEADER_PROGRAM_MISMATCH:${filename}`
            );

        }


        if (
            normalizeStageKey(
                header.stageKey
            )
            !==
            program.stageKey
        ) {

            throw new Error(
                `SCRIPT_HEADER_STAGE_MISMATCH:${filename}`
            );

        }


        if (
            normalizeWorkKey(
                header.workKey
            )
            !==
            program.workKey
        ) {

            throw new Error(
                `SCRIPT_HEADER_WORK_MISMATCH:${filename}`
            );

        }


        if (
            header.runKey
            !==
            program.runKey
        ) {

            throw new Error(
                `SCRIPT_HEADER_RUN_MISMATCH:${filename}`
            );

        }


        if (
            validateFilename(
                header.filename
            )
            !==
            filename
        ) {

            throw new Error(
                `SCRIPT_HEADER_FILENAME_MISMATCH:${filename}`
            );

        }


        const rawDependencies =
            source?.dependencies
            ??
            [];


        if (
            !Array.isArray(
                rawDependencies
            )
        ) {

            throw new Error(
                `SCRIPT_DEPENDENCIES_MUST_BE_ARRAY:${filename}`
            );

        }


        const dependencies =
            rawDependencies.map(
                dependency =>
                    validateFilename(
                        dependency
                    )
            );


        files.push({
            ordinal:
                index
                +
                1,

            filename,

            dependencies,

            content,

            contentSha256:
                sha256(
                    content
                ),

            header: {
                programId:
                    header.programId,

                stageKey:
                    program.stageKey,

                workKey:
                    program.workKey,

                runKey:
                    header.runKey,

                filename:
                    header.filename
            }
        });

    }


    validateDependencies({
        files,
        filenameSet
    });


    const executionOrder =
        topologicalSort(
            files
        );


    const manifestFiles =
        files.map(
            file => ({
                ordinal:
                    file.ordinal,

                filename:
                    file.filename,

                dependencies:
                    file.dependencies,

                contentSha256:
                    file.contentSha256,

                header:
                    file.header
            })
        );


    const canonicalManifest = {
        responseType,

        requestMarker,

        program,

        files:
            manifestFiles,

        executionOrder
    };


    const manifestSha256 =
        sha256(
            JSON.stringify(
                canonicalManifest
            )
        );


    return {
        ...canonicalManifest,

        manifestSha256,

        allFilesValidated:
            true,

        executable:
            true,

        contents:
            Object.fromEntries(
                files.map(
                    file => [
                        file.filename,
                        file.content
                    ]
                )
            )
    };

}


export function evaluateDependencyGate({

    manifest,
    filename,
    outcomes = {}

}) {

    if (
        manifest?.allFilesValidated
        !==
        true
    ) {

        return {
            allowed:
                false,

            reason:
                'PACKAGE_NOT_FULLY_VALIDATED'
        };

    }


    const file =
        manifest.files.find(
            item =>
                item.filename
                ===
                filename
        );


    if (!file) {

        return {
            allowed:
                false,

            reason:
                'SCRIPT_NOT_IN_PACKAGE'
        };

    }


    for (
        const dependency
        of file.dependencies
    ) {

        const outcome =
            outcomes[
                dependency
            ];


        if (
            outcome
            !==
            'success'
        ) {

            return {
                allowed:
                    false,

                reason:
                    outcome
                    ===
                    'failed'
                    ||
                    outcome
                    ===
                    'blocked'
                        ? 'DEPENDENCY_FAILED'
                        : 'DEPENDENCY_NOT_COMPLETED',

                dependency
            };

        }

    }


    return {
        allowed:
            true,

        reason:
            'DEPENDENCIES_SATISFIED'
    };

}


export function propagateDependencyFailure({

    manifest,
    failedFilename,
    outcomes = {}

}) {

    if (
        !manifest?.files
    ) {

        throw new Error(
            'MANIFEST_REQUIRED'
        );

    }


    const nextOutcomes = {
        ...outcomes,

        [
            failedFilename
        ]:
            'failed'
    };


    let changed =
        true;


    while (
        changed
    ) {

        changed =
            false;


        for (
            const file
            of manifest.files
        ) {

            if (
                nextOutcomes[
                    file.filename
                ]
            ) {

                continue;

            }


            const blocked =
                file.dependencies.some(
                    dependency =>
                        nextOutcomes[
                            dependency
                        ]
                        ===
                        'failed'
                        ||
                        nextOutcomes[
                            dependency
                        ]
                        ===
                        'blocked'
                );


            if (
                blocked
            ) {

                nextOutcomes[
                    file.filename
                ] =
                    'blocked';

                changed =
                    true;

            }

        }

    }


    return nextOutcomes;

}

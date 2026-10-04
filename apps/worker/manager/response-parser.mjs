import {
    readFile
} from 'node:fs/promises';

import {
    createHash
} from 'node:crypto';

import {
    assertValidResponseEnvelope
} from './response-contract.mjs';


function sha256(
    value
) {

    return createHash(
        'sha256'
    )
        .update(
            String(value),
            'utf8'
        )
        .digest(
            'hex'
        );

}


function responseError(
    code,
    diagnostic
) {

    const error =
        new Error(
            code
        );


    error.code =
        code;

    error.diagnostic =
        diagnostic;


    return error;

}


function balancedObjectCandidates(
    raw
) {

    const candidates = [];

    let start =
        -1;

    let depth =
        0;

    let inString =
        false;

    let escaped =
        false;


    for (
        let index = 0;
        index < raw.length;
        index += 1
    ) {

        const character =
            raw[index];


        if (
            start < 0
        ) {

            if (
                character === '{'
            ) {

                start =
                    index;

                depth =
                    1;

                inString =
                    false;

                escaped =
                    false;

            }


            continue;

        }


        if (
            inString
        ) {

            if (
                escaped
            ) {

                escaped =
                    false;

                continue;

            }


            if (
                character === '\\'
            ) {

                escaped =
                    true;

                continue;

            }


            if (
                character === '"'
            ) {

                inString =
                    false;

            }


            continue;

        }


        if (
            character === '"'
        ) {

            inString =
                true;

            continue;

        }


        if (
            character === '{'
        ) {

            depth +=
                1;

            continue;

        }


        if (
            character !== '}'
        ) {

            continue;

        }


        depth -=
            1;


        if (
            depth === 0
        ) {

            candidates.push(
                raw.slice(
                    start,
                    index + 1
                )
            );

            start =
                -1;

        }

    }


    return candidates;

}


function responseCandidates(
    raw
) {

    const candidates = [];

    const seen =
        new Set();


    const add = (
        source,
        value
    ) => {

        const text =
            String(
                value ?? ''
            ).trim();


        if (
            !text
            ||
            seen.has(
                text
            )
        ) {

            return;

        }


        seen.add(
            text
        );

        candidates.push({
            source,
            text
        });

    };


    add(
        'exact',
        raw
    );


    const fencePattern =
        /```(?:json)?[ \t]*\r?\n?([\s\S]*?)```/gi;

    let fenceMatch;


    while (
        (
            fenceMatch =
                fencePattern.exec(
                    raw
                )
        )
        !==
        null
    ) {

        add(
            'json_fence',
            fenceMatch[1]
        );

    }


    for (
        const value
        of balancedObjectCandidates(
            raw
        )
    ) {

        add(
            'balanced_object',
            value
        );

    }


    return candidates;

}


function extractResponseEnvelope(
    raw
) {

    const candidates =
        responseCandidates(
            raw
        );

    const syntaxErrors = [];

    const contractErrors = [];

    const valid = [];


    for (
        const candidate
        of candidates
    ) {

        let envelope;


        try {

            envelope =
                JSON.parse(
                    candidate.text
                );

        } catch (error) {

            syntaxErrors.push({
                source:
                    candidate.source,

                message:
                    error instanceof Error
                        ? error.message
                        : String(error)
            });

            continue;

        }


        try {

            assertValidResponseEnvelope(
                envelope
            );

        } catch (error) {

            contractErrors.push({
                source:
                    candidate.source,

                message:
                    error instanceof Error
                        ? error.message
                        : String(error),

                error
            });

            continue;

        }


        valid.push({
            ...candidate,
            envelope
        });

    }


    const diagnostic = {
        rawLength:
            raw.length,

        rawSha256:
            sha256(
                raw
            ),

        candidateCount:
            candidates.length,

        candidateSources:
            candidates.map(
                candidate =>
                    candidate.source
            ),

        syntaxErrors:
            syntaxErrors.slice(
                0,
                8
            ),

        contractErrors:
            contractErrors
                .slice(
                    0,
                    8
                )
                .map(
                    item => ({
                        source:
                            item.source,

                        message:
                            item.message
                    })
                )
    };


    if (
        valid.length === 0
    ) {

        if (
            contractErrors.length > 0
        ) {

            const error =
                contractErrors[0].error;


            if (
                error
                &&
                typeof error === 'object'
            ) {

                error.code =
                    error.code
                    ??
                    'INVALID_RESPONSE_CONTRACT';

                error.diagnostic =
                    diagnostic;

            }


            throw error;

        }


        throw responseError(
            'INVALID_JSON_RESPONSE',
            diagnostic
        );

    }


    if (
        valid.length > 1
    ) {

        throw responseError(
            'AMBIGUOUS_JSON_RESPONSE',
            {
                ...diagnostic,
                validSources:
                    valid.map(
                        candidate =>
                            candidate.source
                    )
            }
        );

    }


    return valid[0];

}


function assertSafeFilename(
    value
) {

    const filename =
        String(value ?? '').trim();


    if (
        !filename
        ||
        filename.includes('/')
        ||
        filename.includes('\\')
        ||
        filename === '.'
        ||
        filename === '..'
        ||
        filename.includes('\0')
    ) {

        throw new Error(
            `UNSAFE_SCRIPT_FILENAME:${filename}`
        );

    }


    return filename;

}


function validateDependencies(
    scripts
) {

    const orders =
        new Set(
            scripts.map(
                script =>
                    script.order
            )
        );


    for (
        const script
        of scripts
    ) {

        const dependencies =
            script.dependsOn ?? [];


        for (
            const dependency
            of dependencies
        ) {

            if (
                !orders.has(
                    dependency
                )
            ) {

                throw new Error(
                    `UNKNOWN_DEPENDENCY:${script.order}->${dependency}`
                );

            }


            if (
                dependency >= script.order
            ) {

                throw new Error(
                    `NON_PRIOR_DEPENDENCY:${script.order}->${dependency}`
                );

            }

        }

    }

}


export function parseManagerResponse(
    rawText,
    {
        batchKey = null
    } = {}
) {

    const raw =
        String(
            rawText ?? ''
        ).trim();


    if (!raw) {

        throw new Error(
            'EMPTY_RESPONSE'
        );

    }


    const extracted =
        extractResponseEnvelope(
            raw
        );

    const envelope =
        extracted.envelope;

    const jsonText =
        extracted.text;


    const responseSha256 =
        sha256(
            jsonText
        );


    const base = {

        protocolVersion:
            1,

        responseType:
            envelope.responseType,

        summary:
            String(
                envelope.summary ?? ''
            ),

        responseSource:
            extracted.source,

        rawResponseSha256:
            sha256(
                raw
            ),

        responseSha256

    };


    if (
        envelope.responseType
        !==
        'script_batch'
    ) {

        return {

            ...base,

            extraction: {
                required:
                    false,

                status:
                    'not_applicable'
            },

            envelope

        };

    }


    const scripts =
        [...envelope.scripts]
            .sort(
                (
                    a,
                    b
                ) =>
                    a.order - b.order
            );


    validateDependencies(
        scripts
    );


    const filenames =
        new Set();


    const normalizedScripts =
        scripts.map(
            script => {

                const filename =
                    assertSafeFilename(
                        script.name
                    );


                if (
                    filenames.has(
                        filename
                    )
                ) {

                    throw new Error(
                        `DUPLICATE_FILENAME:${filename}`
                    );

                }


                filenames.add(
                    filename
                );


                const content =
                    String(
                        script.content
                    );


                return {

                    order:
                        script.order,

                    scriptKey:
                        `${batchKey ?? responseSha256}:${script.order}`,

                    filename,

                    language:
                        String(
                            script.language
                        ),

                    content,

                    sha256:
                        sha256(
                            content
                        ),

                    dependsOn:
                        [
                            ...(
                                script.dependsOn
                                ??
                                []
                            )
                        ],

                    capabilities:
                        Array.isArray(
                            script.capabilities
                        )
                            ?
                            script.capabilities
                            :
                            []

                };

            }
        );


    return {

        ...base,

        batchKey:
            batchKey
            ??
            `batch-${responseSha256.slice(0, 24)}`,

        extraction: {

            required:
                true,

            status:
                'quarantined',

            executable:
                false,

            scriptCount:
                normalizedScripts.length,

            orderingValidated:
                true,

            dependenciesValidated:
                true,

            manualOrPolicyApprovalRequired:
                true

        },

        scripts:
            normalizedScripts,

        manifest: {

            protocolVersion:
                1,

            responseSha256,

            scriptCount:
                normalizedScripts.length,

            ordering:
                normalizedScripts.map(
                    script =>
                        script.order
                ),

            dependencies:
                normalizedScripts.map(
                    script => ({
                        order:
                            script.order,

                        dependsOn:
                            script.dependsOn
                    })
                ),

            quarantine: {

                status:
                    'quarantined',

                executable:
                    false,

                approvalRequired:
                    true

            }

        },

        envelope

    };

}


async function main() {

    const inputFile =
        process.argv[2];

    const batchKey =
        process.argv[3]
        ??
        null;


    if (!inputFile) {

        throw new Error(
            'USAGE: response-parser.mjs INPUT_FILE [BATCH_KEY]'
        );

    }


    const raw =
        await readFile(
            inputFile,
            'utf8'
        );


    const parsed =
        parseManagerResponse(
            raw,
            {
                batchKey
            }
        );


    process.stdout.write(
        JSON.stringify(
            parsed
        )
    );

}


if (
    process.argv[1]
    &&
    import.meta.url
        ===
        new URL(
            `file://${process.argv[1]}`
        ).href
) {

    main()
        .catch(
            error => {

                console.error(
                    error?.stack
                    ??
                    String(error)
                );

                process.exit(
                    1
                );

            }
        );

}

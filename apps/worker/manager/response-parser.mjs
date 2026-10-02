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


    let envelope;


    try {

        envelope =
            JSON.parse(
                raw
            );

    } catch {

        throw new Error(
            'INVALID_JSON_RESPONSE'
        );

    }


    assertValidResponseEnvelope(
        envelope
    );


    const responseSha256 =
        sha256(
            raw
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

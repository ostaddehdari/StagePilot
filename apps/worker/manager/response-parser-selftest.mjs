import {
    parseManagerResponse
} from './response-parser.mjs';


const failures = [];


function check(
    name,
    condition
) {

    if (condition) {

        console.log(
            `${name}: PASS`
        );

        return;

    }


    failures.push(
        name
    );

    console.log(
        `${name}: FAIL`
    );

}


const valid =
    JSON.stringify({

        responseType:
            'script_batch',

        summary:
            'test',

        scripts: [

            {
                order:
                    1,

                name:
                    '01-first.sh',

                language:
                    'bash',

                content:
                    'echo first',

                dependsOn:
                    []
            },

            {
                order:
                    2,

                name:
                    '02-second.sh',

                language:
                    'bash',

                content:
                    'echo second',

                dependsOn:
                    [1]
            }

        ]

    });


const parsed =
    parseManagerResponse(
        valid,
        {
            batchKey:
                'selftest'
        }
    );


check(
    'script-batch-type',
    parsed.responseType
    ===
    'script_batch'
);


check(
    'script-count',
    parsed.scripts.length
    ===
    2
);


check(
    'quarantined',
    parsed.extraction.status
    ===
    'quarantined'
);


check(
    'not-executable',
    parsed.extraction.executable
    ===
    false
);


check(
    'ordered',
    parsed.scripts[0].order
    ===
    1
    &&
    parsed.scripts[1].order
    ===
    2
);


check(
    'dependency-preserved',
    parsed.scripts[1].dependsOn[0]
    ===
    1
);


check(
    'sha256-generated',
    /^[a-f0-9]{64}$/
        .test(
            parsed.scripts[0].sha256
        )
);


const fenced =
    parseManagerResponse(
        `پاسخ آماده است:\n\n\`\`\`json\n${valid}\n\`\`\`\n`,
        {
            batchKey:
                'fenced-selftest'
        }
    );


check(
    'json-fence-extracted',
    fenced.responseType
    ===
    'script_batch'
    &&
    fenced.responseSource
    ===
    'json_fence'
);


const proseWrapped =
    parseManagerResponse(
        `متن توضیحی قبل از پاسخ\n${valid}\nمتن توضیحی بعد از پاسخ`,
        {
            batchKey:
                'balanced-selftest'
        }
    );


check(
    'balanced-json-extracted',
    proseWrapped.responseType
    ===
    'script_batch'
    &&
    proseWrapped.responseSource
    ===
    'balanced_object'
);


const bracesInsideScript =
    parseManagerResponse(
        `before ${JSON.stringify({
            responseType:
                'script_batch',

            summary:
                'braces inside strings',

            scripts: [{
                order:
                    1,

                name:
                    'braces.sh',

                language:
                    'bash',

                content:
                    'printf \'%s\\n\' "{safe}"',

                dependsOn:
                    []
            }]
        })} after`
    );


check(
    'braces-inside-json-string-preserved',
    bracesInsideScript.scripts[0].content
    ===
    'printf \'%s\\n\' "{safe}"'
);


let ambiguousRejected =
    false;


try {

    parseManagerResponse(
        `${JSON.stringify({
            responseType:
                'report_only',

            summary:
                'first'
        })}\n${JSON.stringify({
            responseType:
                'report_only',

            summary:
                'second'
        })}`
    );

} catch (error) {

    ambiguousRejected =
        error?.code
        ===
        'AMBIGUOUS_JSON_RESPONSE';

}


check(
    'ambiguous-json-rejected',
    ambiguousRejected
);


let invalidDiagnosticCaptured =
    false;


try {

    parseManagerResponse(
        'This response contains no JSON object.'
    );

} catch (error) {

    invalidDiagnosticCaptured =
        error?.code
        ===
        'INVALID_JSON_RESPONSE'
        &&
        Number(
            error?.diagnostic?.rawLength
        )
        >
        0
        &&
        typeof error?.diagnostic?.rawSha256
        ===
        'string';

}


check(
    'invalid-json-diagnostic-captured',
    invalidDiagnosticCaptured
);


let badDependencyRejected =
    false;


try {

    parseManagerResponse(
        JSON.stringify({

            responseType:
                'script_batch',

            summary:
                'bad dependency',

            scripts: [

                {
                    order:
                        1,

                    name:
                        'bad.sh',

                    language:
                        'bash',

                    content:
                        'echo bad',

                    dependsOn:
                        [2]
                },

                {
                    order:
                        2,

                    name:
                        'later.sh',

                    language:
                        'bash',

                    content:
                        'echo later',

                    dependsOn:
                        []
                }

            ]

        }),
        {
            batchKey:
                'bad-dependency'
        }
    );

} catch {

    badDependencyRejected =
        true;

}


check(
    'future-dependency-rejected',
    badDependencyRejected
);


const report =
    parseManagerResponse(
        JSON.stringify({

            responseType:
                'report_only',

            summary:
                'report',

            scripts:
                []

        })
    );


check(
    'report-not-extracted',
    report.extraction.required
    ===
    false
);


if (
    failures.length > 0
) {

    console.error(
        `PARSER_SELFTEST_FAILURES=${failures.join(',')}`
    );

    process.exit(
        1
    );

}


console.log(
    'RESPONSE_PARSER_SELFTEST=PASS'
);

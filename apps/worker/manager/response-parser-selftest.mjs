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

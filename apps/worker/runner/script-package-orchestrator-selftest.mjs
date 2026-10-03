import {

    parseStrictResponse

} from './script-package-orchestrator.mjs';


const failures = [];


function check(
    name,
    condition
) {

    if (
        condition
    ) {

        console.log(
            `${name}: PASS`
        );

    } else {

        failures.push(
            name
        );

        console.log(
            `${name}: FAIL`
        );

    }

}


const parsed =
    parseStrictResponse(
        JSON.stringify({
            response_type:
                'report_only',

            request_marker:
                'REQ-1',

            program: {
                id:
                    'stagepilot'
            },

            files:
                []
        })
    );


check(
    'strict-json-object',
    parsed.response_type
    ===
    'report_only'
);


const objectCopy =
    parseStrictResponse({
        response_type:
            'decision_required'
    });


check(
    'object-input-supported',
    objectCopy.response_type
    ===
    'decision_required'
);


let invalidJsonRejected =
    false;


try {

    parseStrictResponse(
        '{broken-json'
    );

} catch (
    error
) {

    invalidJsonRejected =
        error.message
        ===
        'RESPONSE_JSON_INVALID';

}


check(
    'invalid-json-rejected',
    invalidJsonRejected
);


let arrayRejected =
    false;


try {

    parseStrictResponse(
        '[]'
    );

} catch (
    error
) {

    arrayRejected =
        error.message
        ===
        'RESPONSE_OBJECT_REQUIRED';

}


check(
    'array-response-rejected',
    arrayRejected
);


let emptyRejected =
    false;


try {

    parseStrictResponse(
        '   '
    );

} catch (
    error
) {

    emptyRejected =
        error.message
        ===
        'RESPONSE_EMPTY';

}


check(
    'empty-response-rejected',
    emptyRejected
);


if (
    failures.length > 0
) {

    console.error(
        `SCRIPT_PACKAGE_ORCHESTRATOR_SELFTEST_FAILURES=${failures.join(',')}`
    );

    process.exit(
        1
    );

}


console.log(
    'SCRIPT_PACKAGE_ORCHESTRATOR_SELFTEST=PASS'
);

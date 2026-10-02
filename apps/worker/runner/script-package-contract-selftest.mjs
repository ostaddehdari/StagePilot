import {

    validateScriptPackage,
    evaluateDependencyGate,
    propagateDependencyFailure,
    validateFilename

} from './script-package-contract.mjs';


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


function script(
    filename,
    body = 'echo ok'
) {

    return [
        '#!/usr/bin/env bash',
        '# STAGEPILOT-PROGRAM: stagepilot',
        '# STAGEPILOT-STAGE: S07',
        '# STAGEPILOT-WORK: W01',
        '# STAGEPILOT-RUN: test-run-001',
        `# STAGEPILOT-FILE: ${filename}`,
        'set -Eeuo pipefail',
        '',
        body,
        ''
    ].join(
        '\n'
    );

}


const validResponse = {

    response_type:
        'script_batch',

    request_marker:
        'REQ-S07-W01-001',

    program: {
        id:
            'stagepilot',

        stage_key:
            'S07',

        work_key:
            'W01',

        run_key:
            'test-run-001'
    },

    files: [
        {
            filename:
                '01-base.sh',

            dependencies:
                [],

            content:
                script(
                    '01-base.sh'
                )
        },

        {
            filename:
                '02-service.sh',

            dependencies: [
                '01-base.sh'
            ],

            content:
                script(
                    '02-service.sh'
                )
        },

        {
            filename:
                '03-final.sh',

            dependencies: [
                '02-service.sh'
            ],

            content:
                script(
                    '03-final.sh'
                )
        }
    ]
};


const manifest =
    validateScriptPackage(
        validResponse,
        {
            expectedRequestMarker:
                'REQ-S07-W01-001'
        }
    );


check(
    'script-batch-valid',
    manifest.executable
    ===
    true
);


check(
    'all-files-validated-before-execution',
    manifest.allFilesValidated
    ===
    true
);


check(
    'three-files',
    manifest.files.length
    ===
    3
);


check(
    'execution-order',

    JSON.stringify(
        manifest.executionOrder
    )
    ===
    JSON.stringify([
        '01-base.sh',
        '02-service.sh',
        '03-final.sh'
    ])
);


check(
    'manifest-sha256',
    /^[0-9a-f]{64}$/.test(
        manifest.manifestSha256
    )
);


check(
    'file-sha256',

    manifest.files.every(
        file =>
            /^[0-9a-f]{64}$/.test(
                file.contentSha256
            )
    )
);


const firstGate =
    evaluateDependencyGate({
        manifest,

        filename:
            '01-base.sh',

        outcomes:
            {}
    });


check(
    'first-file-no-dependencies',
    firstGate.allowed
    ===
    true
);


const secondBeforeBase =
    evaluateDependencyGate({
        manifest,

        filename:
            '02-service.sh',

        outcomes:
            {}
    });


check(
    'dependent-waits-for-parent',
    secondBeforeBase.allowed
    ===
    false
    &&
    secondBeforeBase.reason
    ===
    'DEPENDENCY_NOT_COMPLETED'
);


const secondAfterBase =
    evaluateDependencyGate({
        manifest,

        filename:
            '02-service.sh',

        outcomes: {
            '01-base.sh':
                'success'
        }
    });


check(
    'dependent-runs-after-success',
    secondAfterBase.allowed
    ===
    true
);


const failurePropagation =
    propagateDependencyFailure({
        manifest,

        failedFilename:
            '01-base.sh'
    });


check(
    'failed-file-recorded',
    failurePropagation[
        '01-base.sh'
    ]
    ===
    'failed'
);


check(
    'direct-dependent-blocked',
    failurePropagation[
        '02-service.sh'
    ]
    ===
    'blocked'
);


check(
    'transitive-dependent-blocked',
    failurePropagation[
        '03-final.sh'
    ]
    ===
    'blocked'
);


let markerRejected =
    false;


try {

    validateScriptPackage(
        validResponse,
        {
            expectedRequestMarker:
                'WRONG-MARKER'
        }
    );

} catch (
    error
) {

    markerRejected =
        error.message
        ===
        'REQUEST_MARKER_MISMATCH';

}


check(
    'request-marker-mismatch-rejected',
    markerRejected
);


let traversalRejected =
    false;


try {

    validateFilename(
        '../bad.sh'
    );

} catch {

    traversalRejected =
        true;

}


check(
    'traversal-filename-rejected',
    traversalRejected
);


let absoluteRejected =
    false;


try {

    validateFilename(
        '/tmp/bad.sh'
    );

} catch {

    absoluteRejected =
        true;

}


check(
    'absolute-filename-rejected',
    absoluteRejected
);


let headerMismatchRejected =
    false;


try {

    const bad = structuredClone(
        validResponse
    );


    bad.files[
        1
    ].content =
        bad.files[
            1
        ].content.replace(
            '# STAGEPILOT-FILE: 02-service.sh',
            '# STAGEPILOT-FILE: wrong.sh'
        );


    validateScriptPackage(
        bad
    );

} catch (
    error
) {

    headerMismatchRejected =
        error.message
        ===
        'SCRIPT_HEADER_FILENAME_MISMATCH:02-service.sh';

}


check(
    'header-filename-mismatch-rejected',
    headerMismatchRejected
);


let missingDependencyRejected =
    false;


try {

    const bad = structuredClone(
        validResponse
    );


    bad.files[
        1
    ].dependencies = [
        '99-missing.sh'
    ];


    validateScriptPackage(
        bad
    );

} catch (
    error
) {

    missingDependencyRejected =
        error.message.startsWith(
            'SCRIPT_DEPENDENCY_MISSING:'
        );

}


check(
    'missing-dependency-rejected',
    missingDependencyRejected
);


let cycleRejected =
    false;


try {

    const bad = structuredClone(
        validResponse
    );


    bad.files[
        0
    ].dependencies = [
        '03-final.sh'
    ];


    validateScriptPackage(
        bad
    );

} catch (
    error
) {

    cycleRejected =
        error.message.startsWith(
            'SCRIPT_DEPENDENCY_CYCLE:'
        );

}


check(
    'dependency-cycle-rejected',
    cycleRejected
);


const reportOnly =
    validateScriptPackage({
        response_type:
            'report_only',

        request_marker:
            'REQ-REPORT-001',

        program: {
            id:
                'stagepilot',

            stage_key:
                'S07',

            work_key:
                'W01',

            run_key:
                'report-run-001'
        },

        files:
            []
    });


check(
    'report-only-supported',
    reportOnly.responseType
    ===
    'report_only'
    &&
    reportOnly.executable
    ===
    false
);


const decisionRequired =
    validateScriptPackage({
        response_type:
            'decision_required',

        request_marker:
            'REQ-DECISION-001',

        program: {
            id:
                'stagepilot',

            stage_key:
                'S07',

            work_key:
                'W01',

            run_key:
                'decision-run-001'
        },

        files:
            []
    });


check(
    'decision-required-supported',
    decisionRequired.responseType
    ===
    'decision_required'
    &&
    decisionRequired.executable
    ===
    false
);


let nonScriptFilesRejected =
    false;


try {

    validateScriptPackage({
        response_type:
            'report_only',

        request_marker:
            'REQ-REPORT-BAD',

        program: {
            id:
                'stagepilot',

            stage_key:
                'S07',

            work_key:
                'W01',

            run_key:
                'report-run-bad'
        },

        files: [
            {
                filename:
                    'bad.sh',

                content:
                    script(
                        'bad.sh'
                    )
            }
        ]
    });

} catch (
    error
) {

    nonScriptFilesRejected =
        error.message
        ===
        'NON_SCRIPT_RESPONSE_MUST_NOT_INCLUDE_FILES';

}


check(
    'non-script-response-files-rejected',
    nonScriptFilesRejected
);


if (
    failures.length > 0
) {

    console.error(
        `SCRIPT_PACKAGE_CONTRACT_SELFTEST_FAILURES=${failures.join(',')}`
    );

    process.exit(
        1
    );

}


console.log(
    'SCRIPT_PACKAGE_CONTRACT_SELFTEST=PASS'
);

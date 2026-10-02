import {
    validateRepositoryName,
    classifyGitHubFailure
} from './github-api-client.mjs';


const failures = [];


function check(
    name,
    value
) {

    if (value) {

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


check(
    'valid-repository-name',

    validateRepositoryName(
        'stagepilot-test-01'
    )
    ===
    'stagepilot-test-01'
);


let invalidRejected =
    false;


try {

    validateRepositoryName(
        '../invalid'
    );

} catch {

    invalidRejected =
        true;

}


check(
    'repository-traversal-rejected',
    invalidRejected
);


check(
    '401-classification',
    classifyGitHubFailure(
        401
    )
    ===
    'AUTHENTICATION_FAILED'
);


check(
    '403-classification',
    classifyGitHubFailure(
        403
    )
    ===
    'PERMISSION_DENIED'
);


check(
    '422-classification',
    classifyGitHubFailure(
        422
    )
    ===
    'VALIDATION_FAILED'
);


if (
    failures.length > 0
) {

    console.error(
        `SELFTEST_FAILURES=${failures.join(',')}`
    );

    process.exit(
        1
    );

}


console.log(
    'GITHUB_API_CLIENT_SELFTEST=PASS'
);

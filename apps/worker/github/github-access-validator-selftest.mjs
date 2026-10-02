import {
    parseFileSecretRef
} from './github-access-validator.mjs';


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


const good =
    parseFileSecretRef(
        'file:///opt/stagepilot/runtime/github/example-secret'
    );


check(
    'allowed-secret-root',
    good
    ===
    '/opt/stagepilot/runtime/github/example-secret'
);


let outsideRejected =
    false;


try {

    parseFileSecretRef(
        'file:///root/private-key'
    );

} catch {

    outsideRejected =
        true;

}


check(
    'outside-secret-root-rejected',
    outsideRejected
);


let plaintextRejected =
    false;


try {

    parseFileSecretRef(
        'github_pat_example'
    );

} catch {

    plaintextRejected =
        true;

}


check(
    'plaintext-secret-rejected',
    plaintextRejected
);


if (
    failures.length > 0
) {

    console.error(
        `GITHUB_VALIDATOR_SELFTEST_FAILURES=${failures.join(',')}`
    );

    process.exit(
        1
    );

}


console.log(
    'GITHUB_ACCESS_VALIDATOR_SELFTEST=PASS'
);

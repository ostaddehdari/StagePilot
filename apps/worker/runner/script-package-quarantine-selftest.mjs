import {
    approvalBindingHash,
    ensureContainedPath
} from './script-package-quarantine.mjs';


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


const hash1 =
    approvalBindingHash({
        packageId:
            'package-1',

        manifestSha256:
            'a'.repeat(
                64
            ),

        serverKey:
            'server-main',

        workspacePath:
            '/srv/project-a'
    });


const hash2 =
    approvalBindingHash({
        packageId:
            'package-1',

        manifestSha256:
            'a'.repeat(
                64
            ),

        serverKey:
            'server-main',

        workspacePath:
            '/srv/project-a'
    });


check(
    'binding-hash-deterministic',
    hash1
    ===
    hash2
);


check(
    'binding-hash-sha256',
    /^[0-9a-f]{64}$/.test(
        hash1
    )
);


const hashServerChanged =
    approvalBindingHash({
        packageId:
            'package-1',

        manifestSha256:
            'a'.repeat(
                64
            ),

        serverKey:
            'server-other',

        workspacePath:
            '/srv/project-a'
    });


check(
    'server-change-changes-binding',
    hashServerChanged
    !==
    hash1
);


const hashWorkspaceChanged =
    approvalBindingHash({
        packageId:
            'package-1',

        manifestSha256:
            'a'.repeat(
                64
            ),

        serverKey:
            'server-main',

        workspacePath:
            '/srv/project-b'
    });


check(
    'workspace-change-changes-binding',
    hashWorkspaceChanged
    !==
    hash1
);


const contained =
    ensureContainedPath({
        basePath:
            '/safe/quarantine',

        candidatePath:
            '/safe/quarantine/package-1'
    });


check(
    'contained-path-accepted',
    contained.candidate
    ===
    '/safe/quarantine/package-1'
);


let outsideRejected =
    false;


try {

    ensureContainedPath({
        basePath:
            '/safe/quarantine',

        candidatePath:
            '/safe/other'
    });

} catch (
    error
) {

    outsideRejected =
        error.message
        ===
        'QUARANTINE_PATH_OUTSIDE_ALLOWED_ROOT';

}


check(
    'outside-path-rejected',
    outsideRejected
);


let sameRootRejected =
    false;


try {

    ensureContainedPath({
        basePath:
            '/safe/quarantine',

        candidatePath:
            '/safe/quarantine'
    });

} catch (
    error
) {

    sameRootRejected =
        error.message
        ===
        'QUARANTINE_PATH_OUTSIDE_ALLOWED_ROOT';

}


check(
    'base-root-itself-rejected',
    sameRootRejected
);


if (
    failures.length > 0
) {

    console.error(
        `SCRIPT_PACKAGE_QUARANTINE_SELFTEST_FAILURES=${failures.join(',')}`
    );

    process.exit(
        1
    );

}


console.log(
    'SCRIPT_PACKAGE_QUARANTINE_SELFTEST=PASS'
);

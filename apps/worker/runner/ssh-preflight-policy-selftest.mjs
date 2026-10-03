import {
    assertCredentialFreeEvidence,
    ensureWorkspaceInsideRoot,
    preflightSshTarget,
    sanitizeSshProfileForEvidence,
    validateSshProfile
} from './ssh-preflight-policy.mjs';


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


const fingerprint =
    'SHA256:abcdefghijklmnopqrstuvwx1234567890ABCDE';


const sha =
    'a'.repeat(
        40
    );


const profile = {
    profileKey:
        'stagepilot-test',

    serverKey:
        'server-main',

    hostLabel:
        'Primary StagePilot Test Server',

    hostname:
        'stagepilot.internal',

    port:
        2233,

    username:
        'stagepilot-runner',

    hostKeyType:
        'ssh-ed25519',

    hostKeyFingerprint:
        fingerprint,

    knownHostsRef:
        'file:///runtime/ssh/known_hosts',

    identityRef:
        'file:///runtime/ssh/id_ed25519',

    allowedWorkspaceRoot:
        '/srv/stagepilot-workspaces',

    expectedBranch:
        'stage/S07',

    resources: {
        minFreeDiskMb:
            1024,

        minFreeMemoryMb:
            512,

        maxLoad1:
            8
    }
};


const observed = {
    hostname:
        'stagepilot.internal',

    port:
        2233,

    username:
        'stagepilot-runner',

    hostKeyType:
        'ssh-ed25519',

    hostKeyFingerprint:
        fingerprint,

    workspacePath:
        '/srv/stagepilot-workspaces/project-a',

    branchName:
        'stage/S07',

    codeSha:
        sha,

    resources: {
        freeDiskMb:
            5000,

        freeMemoryMb:
            4096,

        load1:
            1.5
    }
};


const normalized =
    validateSshProfile(
        profile
    );


check(
    'profile-valid',
    normalized.username
    ===
    'stagepilot-runner'
);


const valid =
    preflightSshTarget({
        profile,

        expectedCodeSha:
            sha,

        observed
    });


check(
    'valid-preflight-pass',
    valid.passed
    ===
    true
);


check(
    'valid-transport-allowed',
    valid.transportAllowed
    ===
    true
);


check(
    'valid-execution-allowed',
    valid.executionAllowed
    ===
    true
);


function mismatch(
    patch
) {

    return preflightSshTarget({
        profile,

        expectedCodeSha:
            sha,

        observed: {
            ...observed,
            ...patch
        }
    });

}


check(
    'wrong-host-blocked',

    mismatch({
        hostname:
            'wrong.internal'
    }).errorCode
    ===
    'SSH_HOST_MISMATCH'
);


check(
    'wrong-port-blocked',

    mismatch({
        port:
            22
    }).errorCode
    ===
    'SSH_PORT_MISMATCH'
);


check(
    'wrong-user-blocked',

    mismatch({
        username:
            'root'
    }).errorCode
    ===
    'SSH_USERNAME_MISMATCH'
);


check(
    'wrong-host-key-type-blocked',

    mismatch({
        hostKeyType:
            'ssh-rsa'
    }).errorCode
    ===
    'SSH_HOST_KEY_TYPE_MISMATCH'
);


check(
    'wrong-fingerprint-blocked',

    mismatch({
        hostKeyFingerprint:
            'SHA256:ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ'
    }).errorCode
    ===
    'SSH_HOST_KEY_FINGERPRINT_MISMATCH'
);


check(
    'wrong-workspace-blocked',

    mismatch({
        workspacePath:
            '/srv/other/project-a'
    }).errorCode
    ===
    'SSH_WORKSPACE_OUTSIDE_ALLOWED_ROOT'
);


check(
    'wrong-branch-blocked',

    mismatch({
        branchName:
            'main'
    }).errorCode
    ===
    'SSH_BRANCH_MISMATCH'
);


check(
    'wrong-code-sha-blocked',

    mismatch({
        codeSha:
            'b'.repeat(
                40
            )
    }).errorCode
    ===
    'SSH_CODE_SHA_MISMATCH'
);


check(
    'low-disk-blocked',

    mismatch({
        resources: {
            ...observed.resources,

            freeDiskMb:
                100
        }
    }).errorCode
    ===
    'SSH_INSUFFICIENT_DISK'
);


check(
    'low-memory-blocked',

    mismatch({
        resources: {
            ...observed.resources,

            freeMemoryMb:
                100
        }
    }).errorCode
    ===
    'SSH_INSUFFICIENT_MEMORY'
);


check(
    'high-load-blocked',

    mismatch({
        resources: {
            ...observed.resources,

            load1:
                20
        }
    }).errorCode
    ===
    'SSH_LOAD_TOO_HIGH'
);


const contained =
    ensureWorkspaceInsideRoot({
        allowedRoot:
            '/srv/stagepilot-workspaces',

        workspacePath:
            '/srv/stagepilot-workspaces/project-a'
    });


check(
    'contained-workspace-valid',
    contained.workspace
    ===
    '/srv/stagepilot-workspaces/project-a'
);


let rootItselfRejected =
    false;


try {

    ensureWorkspaceInsideRoot({
        allowedRoot:
            '/srv/stagepilot-workspaces',

        workspacePath:
            '/srv/stagepilot-workspaces'
    });

} catch (
    error
) {

    rootItselfRejected =
        error.message
        ===
        'SSH_WORKSPACE_OUTSIDE_ALLOWED_ROOT';

}


check(
    'workspace-root-itself-rejected',
    rootItselfRejected
);


const evidence =
    sanitizeSshProfileForEvidence(
        profile
    );


check(
    'identity-ref-redacted',
    evidence.identityRef
    ===
    undefined
);


check(
    'known-hosts-ref-redacted',
    evidence.knownHostsRef
    ===
    undefined
);


check(
    'credentials-redacted-marker',
    evidence.credentialsRedacted
    ===
    true
);


check(
    'safe-evidence-credential-free',
    assertCredentialFreeEvidence(
        evidence
    )
    ===
    true
);


let credentialFieldRejected =
    false;


try {

    assertCredentialFreeEvidence({
        host:
            'example',

        identityRef:
            'file:///private/key'
    });

} catch (
    error
) {

    credentialFieldRejected =
        error.message.startsWith(
            'CREDENTIAL_FIELD_IN_EVIDENCE:'
        );

}


check(
    'credential-field-evidence-rejected',
    credentialFieldRejected
);


let privateKeyRejected =
    false;


try {

    assertCredentialFreeEvidence({
        output:
            '-----BEGIN OPENSSH PRIVATE KEY-----'
    });

} catch (
    error
) {

    privateKeyRejected =
        error.message.startsWith(
            'CREDENTIAL_MATERIAL_IN_EVIDENCE:'
        );

}


check(
    'private-key-evidence-rejected',
    privateKeyRejected
);


if (
    failures.length > 0
) {

    console.error(
        `SSH_PREFLIGHT_POLICY_SELFTEST_FAILURES=${failures.join(',')}`
    );

    process.exit(
        1
    );

}


console.log(
    'SSH_PREFLIGHT_POLICY_SELFTEST=PASS'
);

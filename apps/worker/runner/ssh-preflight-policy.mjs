import {
    isAbsolute,
    relative,
    resolve
} from 'node:path';


const SHA_PATTERN =
    /^[0-9a-f]{40,64}$/;


const HOST_FINGERPRINT_PATTERN =
    /^SHA256:[A-Za-z0-9+/=_-]{16,}$/;


const SENSITIVE_KEY_PATTERN =
    /(password|passwd|secret|token|credential|identityref|identity_ref|private.?key|authorization|cookie|session)/i;


const SENSITIVE_VALUE_PATTERNS = [
    /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
    /github_pat_[A-Za-z0-9_]{20,}/,
    /gh[pousr]_[A-Za-z0-9]{20,}/
];


function requiredText(
    value,
    code
) {

    const text =
        String(
            value
            ??
            ''
        ).trim();


    if (!text) {

        throw new Error(
            code
        );

    }


    return text;

}


function integer(
    value,
    code
) {

    const number =
        Number(
            value
        );


    if (
        !Number.isInteger(
            number
        )
    ) {

        throw new Error(
            code
        );

    }


    return number;

}


function finiteNumber(
    value,
    code
) {

    const number =
        Number(
            value
        );


    if (
        !Number.isFinite(
            number
        )
    ) {

        throw new Error(
            code
        );

    }


    return number;

}


function absolutePath(
    value,
    code
) {

    const text =
        requiredText(
            value,
            code
        );


    if (
        !isAbsolute(
            text
        )
    ) {

        throw new Error(
            `${code}_NOT_ABSOLUTE`
        );

    }


    const normalized =
        resolve(
            text
        );


    if (
        normalized
        ===
        '/'
    ) {

        throw new Error(
            `${code}_ROOT_FORBIDDEN`
        );

    }


    return normalized;

}


export function ensureWorkspaceInsideRoot({

    allowedRoot,
    workspacePath

}) {

    const root =
        absolutePath(
            allowedRoot,
            'ALLOWED_WORKSPACE_ROOT'
        );


    const workspace =
        absolutePath(
            workspacePath,
            'WORKSPACE_PATH'
        );


    const rel =
        relative(
            root,
            workspace
        );


    if (
        rel
        ===
        ''
        ||
        rel
            .split(
                /[\\/]+/
            )
            .includes(
                '..'
            )
        ||
        isAbsolute(
            rel
        )
    ) {

        throw new Error(
            'SSH_WORKSPACE_OUTSIDE_ALLOWED_ROOT'
        );

    }


    return {
        root,
        workspace
    };

}


export function validateSshProfile(
    profile
) {

    const normalized = {
        profileKey:
            requiredText(
                profile?.profileKey,
                'SSH_PROFILE_KEY_REQUIRED'
            ),

        serverKey:
            requiredText(
                profile?.serverKey,
                'SSH_SERVER_KEY_REQUIRED'
            ),

        hostLabel:
            requiredText(
                profile?.hostLabel,
                'SSH_HOST_LABEL_REQUIRED'
            ),

        hostname:
            requiredText(
                profile?.hostname,
                'SSH_HOSTNAME_REQUIRED'
            ).toLowerCase(),

        port:
            integer(
                profile?.port,
                'SSH_PORT_INVALID'
            ),

        username:
            requiredText(
                profile?.username,
                'SSH_USERNAME_REQUIRED'
            ),

        hostKeyType:
            requiredText(
                profile?.hostKeyType
                ??
                'ssh-ed25519',
                'SSH_HOST_KEY_TYPE_REQUIRED'
            ),

        hostKeyFingerprint:
            requiredText(
                profile?.hostKeyFingerprint,
                'SSH_HOST_KEY_FINGERPRINT_REQUIRED'
            ),

        knownHostsRef:
            requiredText(
                profile?.knownHostsRef,
                'SSH_KNOWN_HOSTS_REF_REQUIRED'
            ),

        identityRef:
            requiredText(
                profile?.identityRef,
                'SSH_IDENTITY_REF_REQUIRED'
            ),

        allowedWorkspaceRoot:
            absolutePath(
                profile?.allowedWorkspaceRoot,
                'ALLOWED_WORKSPACE_ROOT'
            ),

        expectedBranch:
            requiredText(
                profile?.expectedBranch,
                'SSH_EXPECTED_BRANCH_REQUIRED'
            ),

        resources: {
            minFreeDiskMb:
                finiteNumber(
                    profile?.resources?.minFreeDiskMb
                    ??
                    0,
                    'SSH_MIN_DISK_INVALID'
                ),

            minFreeMemoryMb:
                finiteNumber(
                    profile?.resources?.minFreeMemoryMb
                    ??
                    0,
                    'SSH_MIN_MEMORY_INVALID'
                ),

            maxLoad1:
                finiteNumber(
                    profile?.resources?.maxLoad1
                    ??
                    999999,
                    'SSH_MAX_LOAD_INVALID'
                )
        }
    };


    if (
        normalized.port < 1
        ||
        normalized.port > 65535
    ) {

        throw new Error(
            'SSH_PORT_OUT_OF_RANGE'
        );

    }


    if (
        !HOST_FINGERPRINT_PATTERN.test(
            normalized.hostKeyFingerprint
        )
    ) {

        throw new Error(
            'SSH_HOST_KEY_FINGERPRINT_INVALID'
        );

    }


    if (
        !normalized.knownHostsRef.startsWith(
            'file://'
        )
    ) {

        throw new Error(
            'SSH_KNOWN_HOSTS_REF_MUST_BE_FILE'
        );

    }


    if (
        !normalized.identityRef.startsWith(
            'file://'
        )
    ) {

        throw new Error(
            'SSH_IDENTITY_REF_MUST_BE_FILE'
        );

    }


    if (
        /\s/.test(
            normalized.expectedBranch
        )
    ) {

        throw new Error(
            'SSH_EXPECTED_BRANCH_INVALID'
        );

    }


    if (
        normalized.resources.minFreeDiskMb < 0
        ||
        normalized.resources.minFreeMemoryMb < 0
        ||
        normalized.resources.maxLoad1 <= 0
    ) {

        throw new Error(
            'SSH_RESOURCE_LIMIT_INVALID'
        );

    }


    return normalized;

}


function fail(
    code,
    details = {}
) {

    return {
        passed:
            false,

        transportAllowed:
            false,

        executionAllowed:
            false,

        errorCode:
            code,

        details
    };

}


export function preflightSshTarget({

    profile,
    expectedCodeSha,
    observed

}) {

    const p =
        validateSshProfile(
            profile
        );


    const codeSha =
        requiredText(
            expectedCodeSha,
            'EXPECTED_CODE_SHA_REQUIRED'
        ).toLowerCase();


    if (
        !SHA_PATTERN.test(
            codeSha
        )
    ) {

        throw new Error(
            'EXPECTED_CODE_SHA_INVALID'
        );

    }


    const observedHostname =
        requiredText(
            observed?.hostname,
            'OBSERVED_HOSTNAME_REQUIRED'
        ).toLowerCase();


    const observedPort =
        integer(
            observed?.port,
            'OBSERVED_PORT_INVALID'
        );


    const observedUsername =
        requiredText(
            observed?.username,
            'OBSERVED_USERNAME_REQUIRED'
        );


    const observedHostKeyType =
        requiredText(
            observed?.hostKeyType,
            'OBSERVED_HOST_KEY_TYPE_REQUIRED'
        );


    const observedFingerprint =
        requiredText(
            observed?.hostKeyFingerprint,
            'OBSERVED_HOST_FINGERPRINT_REQUIRED'
        );


    const observedBranch =
        requiredText(
            observed?.branchName,
            'OBSERVED_BRANCH_REQUIRED'
        );


    const observedCodeSha =
        requiredText(
            observed?.codeSha,
            'OBSERVED_CODE_SHA_REQUIRED'
        ).toLowerCase();


    if (
        observedHostname
        !==
        p.hostname
    ) {

        return fail(
            'SSH_HOST_MISMATCH',
            {
                expected:
                    p.hostname,

                observed:
                    observedHostname
            }
        );

    }


    if (
        observedPort
        !==
        p.port
    ) {

        return fail(
            'SSH_PORT_MISMATCH'
        );

    }


    if (
        observedUsername
        !==
        p.username
    ) {

        return fail(
            'SSH_USERNAME_MISMATCH'
        );

    }


    if (
        observedHostKeyType
        !==
        p.hostKeyType
    ) {

        return fail(
            'SSH_HOST_KEY_TYPE_MISMATCH'
        );

    }


    if (
        observedFingerprint
        !==
        p.hostKeyFingerprint
    ) {

        return fail(
            'SSH_HOST_KEY_FINGERPRINT_MISMATCH'
        );

    }


    let workspace;


    try {

        workspace =
            ensureWorkspaceInsideRoot({
                allowedRoot:
                    p.allowedWorkspaceRoot,

                workspacePath:
                    observed?.workspacePath
            });

    } catch (
        error
    ) {

        return fail(
            error.message
        );

    }


    if (
        observedBranch
        !==
        p.expectedBranch
    ) {

        return fail(
            'SSH_BRANCH_MISMATCH',
            {
                expected:
                    p.expectedBranch,

                observed:
                    observedBranch
            }
        );

    }


    if (
        !SHA_PATTERN.test(
            observedCodeSha
        )
    ) {

        return fail(
            'SSH_OBSERVED_CODE_SHA_INVALID'
        );

    }


    if (
        observedCodeSha
        !==
        codeSha
    ) {

        return fail(
            'SSH_CODE_SHA_MISMATCH'
        );

    }


    const freeDiskMb =
        finiteNumber(
            observed?.resources?.freeDiskMb,
            'OBSERVED_FREE_DISK_INVALID'
        );


    const freeMemoryMb =
        finiteNumber(
            observed?.resources?.freeMemoryMb,
            'OBSERVED_FREE_MEMORY_INVALID'
        );


    const load1 =
        finiteNumber(
            observed?.resources?.load1,
            'OBSERVED_LOAD_INVALID'
        );


    if (
        freeDiskMb
        <
        p.resources.minFreeDiskMb
    ) {

        return fail(
            'SSH_INSUFFICIENT_DISK'
        );

    }


    if (
        freeMemoryMb
        <
        p.resources.minFreeMemoryMb
    ) {

        return fail(
            'SSH_INSUFFICIENT_MEMORY'
        );

    }


    if (
        load1
        >
        p.resources.maxLoad1
    ) {

        return fail(
            'SSH_LOAD_TOO_HIGH'
        );

    }


    return {
        passed:
            true,

        transportAllowed:
            true,

        executionAllowed:
            true,

        errorCode:
            null,

        evidence: {
            serverKey:
                p.serverKey,

            hostLabel:
                p.hostLabel,

            hostname:
                p.hostname,

            port:
                p.port,

            username:
                p.username,

            hostKeyType:
                p.hostKeyType,

            hostKeyFingerprint:
                p.hostKeyFingerprint,

            workspacePath:
                workspace.workspace,

            expectedBranch:
                p.expectedBranch,

            observedBranch,

            expectedCodeSha:
                codeSha,

            observedCodeSha,

            resources: {
                freeDiskMb,

                freeMemoryMb,

                load1,

                minimumDiskMb:
                    p.resources.minFreeDiskMb,

                minimumMemoryMb:
                    p.resources.minFreeMemoryMb,

                maximumLoad1:
                    p.resources.maxLoad1
            }
        }
    };

}


export function sanitizeSshProfileForEvidence(
    profile
) {

    const p =
        validateSshProfile(
            profile
        );


    return {
        profileKey:
            p.profileKey,

        serverKey:
            p.serverKey,

        hostLabel:
            p.hostLabel,

        hostname:
            p.hostname,

        port:
            p.port,

        username:
            p.username,

        hostKeyType:
            p.hostKeyType,

        hostKeyFingerprint:
            p.hostKeyFingerprint,

        allowedWorkspaceRoot:
            p.allowedWorkspaceRoot,

        expectedBranch:
            p.expectedBranch,

        resources:
            {
                ...p.resources
            },

        credentialsRedacted:
            true
    };

}


export function assertCredentialFreeEvidence(
    value
) {

    function visit(
        current,
        path = []
    ) {

        if (
            current === null
            ||
            current === undefined
        ) {

            return;

        }


        if (
            typeof current
            ===
            'string'
        ) {

            for (
                const pattern
                of SENSITIVE_VALUE_PATTERNS
            ) {

                if (
                    pattern.test(
                        current
                    )
                ) {

                    throw new Error(
                        `CREDENTIAL_MATERIAL_IN_EVIDENCE:${path.join('.')}`
                    );

                }

            }


            return;

        }


        if (
            Array.isArray(
                current
            )
        ) {

            current.forEach(
                (
                    item,
                    index
                ) =>
                    visit(
                        item,
                        [
                            ...path,
                            String(
                                index
                            )
                        ]
                    )
            );


            return;

        }


        if (
            typeof current
            ===
            'object'
        ) {

            for (
                const [
                    key,
                    child
                ]
                of Object.entries(
                    current
                )
            ) {

                if (
                    key
                    ===
                    'credentialsRedacted'
                    &&
                    child
                    ===
                    true
                ) {

                    continue;

                }


                if (
                    SENSITIVE_KEY_PATTERN.test(
                        key
                    )
                ) {

                    throw new Error(
                        `CREDENTIAL_FIELD_IN_EVIDENCE:${[
                            ...path,
                            key
                        ].join('.')}`
                    );

                }


                visit(
                    child,
                    [
                        ...path,
                        key
                    ]
                );

            }

        }

    }


    visit(
        value
    );


    return true;

}

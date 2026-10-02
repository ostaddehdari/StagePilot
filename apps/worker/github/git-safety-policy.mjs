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


function normalizeLines(
    value
) {

    return String(
        value
        ??
        ''
    )
        .split(
            /\r?\n/
        )
        .map(
            line =>
                line.trimEnd()
        )
        .filter(
            line =>
                line.length
                >
                0
        );

}


const CONFLICT_CODES =
    new Set([
        'DD',
        'AU',
        'UD',
        'UA',
        'DU',
        'AA',
        'UU'
    ]);


export function classifyWorkspaceState({

    statusPorcelain = '',
    unmergedPaths = []

} = {}) {

    const lines =
        normalizeLines(
            statusPorcelain
        );


    const explicitUnmerged =
        Array.isArray(
            unmergedPaths
        )
            ? unmergedPaths.filter(
                Boolean
            )
            : [];


    const porcelainConflicts =
        lines.filter(
            line =>
                CONFLICT_CODES.has(
                    line.slice(
                        0,
                        2
                    )
                )
        );


    if (
        explicitUnmerged.length > 0
        ||
        porcelainConflicts.length > 0
    ) {

        return {
            state:
                'MERGE_CONFLICT',

            safeToCommit:
                false,

            safeToPush:
                false,

            decisionRequired:
                true,

            preserveManualChanges:
                true,

            automaticResolution:
                false,

            evidence: {
                statusLines:
                    lines,

                unmergedPaths:
                    [
                        ...explicitUnmerged
                    ],

                conflictLines:
                    porcelainConflicts
            }
        };

    }


    if (
        lines.length > 0
    ) {

        return {
            state:
                'DIRTY_TREE',

            safeToCommit:
                false,

            safeToPush:
                false,

            decisionRequired:
                true,

            preserveManualChanges:
                true,

            automaticClean:
                false,

            automaticReset:
                false,

            automaticStash:
                false,

            evidence: {
                statusLines:
                    lines
            }
        };

    }


    return {
        state:
            'CLEAN',

        safeToCommit:
            true,

        safeToPush:
            true,

        decisionRequired:
            false,

        preserveManualChanges:
            true,

        evidence: {
            statusLines:
                []
        }
    };

}


export function classifyRemoteRelation({

    ahead,
    behind

}) {

    const localAhead =
        Number(
            ahead
            ??
            0
        );


    const localBehind =
        Number(
            behind
            ??
            0
        );


    if (
        !Number.isInteger(
            localAhead
        )
        ||
        !Number.isInteger(
            localBehind
        )
        ||
        localAhead < 0
        ||
        localBehind < 0
    ) {

        throw new Error(
            'INVALID_AHEAD_BEHIND_COUNT'
        );

    }


    if (
        localAhead
        ===
        0
        &&
        localBehind
        ===
        0
    ) {

        return {
            state:
                'IN_SYNC',

            pushAllowed:
                true,

            decisionRequired:
                false,

            automaticForcePush:
                false
        };

    }


    if (
        localAhead > 0
        &&
        localBehind
        ===
        0
    ) {

        return {
            state:
                'LOCAL_AHEAD',

            pushAllowed:
                true,

            decisionRequired:
                false,

            automaticForcePush:
                false
        };

    }


    if (
        localAhead
        ===
        0
        &&
        localBehind > 0
    ) {

        return {
            state:
                'REMOTE_AHEAD',

            pushAllowed:
                false,

            decisionRequired:
                true,

            automaticMerge:
                false,

            automaticRebase:
                false,

            automaticForcePush:
                false
        };

    }


    return {
        state:
            'REMOTE_DIVERGED',

        pushAllowed:
            false,

        decisionRequired:
            true,

        automaticMerge:
            false,

        automaticRebase:
            false,

        automaticForcePush:
            false
    };

}


export function classifyPushFailure({

    stderr = '',
    exitCode = 1

} = {}) {

    const message =
        String(
            stderr
            ??
            ''
        );


    const normalized =
        message.toLowerCase();


    if (
        /permission\s+(?:to\s+.+\s+)?denied(?:\s+to)?|repository not found|authentication failed|could not read from remote repository|write access.*not granted|(?:^|\D)403(?:\D|$)/.test(
            normalized
        )
    ) {

        return {
            issueType:
                'PERMISSION_DENIED',

            state:
                'decision_required',

            retryAction:
                'REQUIRE_PERMISSION_FIX',

            rerunImplementation:
                false,

            recreateCommit:
                false,

            automaticForcePush:
                false,

            exitCode
        };

    }


    if (
        /protected branch|protected branch hook declined|gh006/.test(
            normalized
        )
    ) {

        return {
            issueType:
                'PROTECTED_BRANCH',

            state:
                'decision_required',

            retryAction:
                'REQUIRE_DECISION',

            rerunImplementation:
                false,

            recreateCommit:
                false,

            automaticForcePush:
                false,

            exitCode
        };

    }


    if (
        /non-fast-forward|fetch first|stale info|updates were rejected|failed to push some refs/.test(
            normalized
        )
    ) {

        return {
            issueType:
                'REMOTE_REJECTED',

            state:
                'decision_required',

            retryAction:
                'RECONCILE_REMOTE',

            rerunImplementation:
                false,

            recreateCommit:
                false,

            automaticForcePush:
                false,

            exitCode
        };

    }


    if (
        /could not resolve host|connection timed out|connection reset|network is unreachable|temporary failure|connection refused/.test(
            normalized
        )
    ) {

        return {
            issueType:
                'NETWORK_FAILURE',

            state:
                'pending',

            retryAction:
                'PUSH_ONLY',

            rerunImplementation:
                false,

            recreateCommit:
                false,

            automaticForcePush:
                false,

            exitCode
        };

    }


    return {
        issueType:
            'REMOTE_REJECTED',

        state:
            'decision_required',

        retryAction:
            'RECONCILE_REMOTE',

        rerunImplementation:
            false,

        recreateCommit:
            false,

        automaticForcePush:
            false,

        exitCode
    };

}


export function validateAutomatedGitArgs(
    args
) {

    if (
        !Array.isArray(
            args
        )
        ||
        args.length
        ===
        0
    ) {

        throw new Error(
            'GIT_ARGUMENTS_REQUIRED'
        );

    }


    const normalized =
        args.map(
            value =>
                String(
                    value
                )
        );


    const command =
        normalized[0];


    const forcePush =
        normalized.some(
            value =>
                value
                ===
                '--force'
                ||
                value
                ===
                '--force-with-lease'
                ||
                value
                ===
                '-f'
        )
        ||
        (
            command
            ===
            'push'
            &&
            normalized
                .slice(
                    1
                )
                .some(
                    value =>
                        value.startsWith(
                            '+'
                        )
                )
        );


    if (
        forcePush
    ) {

        throw new Error(
            'AUTOMATIC_FORCE_PUSH_FORBIDDEN'
        );

    }


    if (
        command
        ===
        'clean'
    ) {

        throw new Error(
            'AUTOMATIC_GIT_CLEAN_FORBIDDEN'
        );

    }


    if (
        command
        ===
        'stash'
    ) {

        throw new Error(
            'AUTOMATIC_GIT_STASH_FORBIDDEN'
        );

    }


    if (
        command
        ===
        'reset'
    ) {

        throw new Error(
            'AUTOMATIC_GIT_RESET_FORBIDDEN'
        );

    }


    if (
        command
        ===
        'restore'
    ) {

        throw new Error(
            'AUTOMATIC_GIT_RESTORE_FORBIDDEN'
        );

    }


    if (
        command
        ===
        'checkout'
        &&
        normalized.includes(
            '--'
        )
    ) {

        throw new Error(
            'AUTOMATIC_CHECKOUT_OVERWRITE_FORBIDDEN'
        );

    }


    if (
        command
        ===
        'merge'
        ||
        command
        ===
        'rebase'
        ||
        command
        ===
        'cherry-pick'
    ) {

        throw new Error(
            'AUTOMATIC_HISTORY_INTEGRATION_REQUIRES_DECISION'
        );

    }


    return {
        allowed:
            true,

        automaticForcePush:
            false,

        preservesManualChanges:
            true
    };

}


export function verifyHooksIsolation({

    configuredHooksPath,
    expectedHooksPath

}) {

    const configured =
        requiredText(
            configuredHooksPath,
            'CONFIGURED_HOOKS_PATH_REQUIRED'
        );


    const expected =
        requiredText(
            expectedHooksPath,
            'EXPECTED_HOOKS_PATH_REQUIRED'
        );


    if (
        configured
        !==
        expected
    ) {

        return {
            verified:
                false,

            issueType:
                'HOOK_CONFIGURATION',

            mutationAllowed:
                false,

            decisionRequired:
                true,

            untrustedHooksDisabled:
                false
        };

    }


    return {
        verified:
            true,

        issueType:
            'SAFE',

        mutationAllowed:
            true,

        decisionRequired:
            false,

        untrustedHooksDisabled:
            true
    };

}


export function buildGitSafetyReport({

    issueType,
    status,
    localEvidence = {},
    remoteEvidence = {},
    decisionRequired = false,
    metadata = {}

}) {

    const allowedIssues =
        new Set([
            'DIRTY_TREE',
            'MERGE_CONFLICT',
            'REMOTE_AHEAD',
            'LOCAL_AHEAD',
            'REMOTE_DIVERGED',
            'PERMISSION_DENIED',
            'PROTECTED_BRANCH',
            'NETWORK_FAILURE',
            'REMOTE_REJECTED',
            'HOOK_CONFIGURATION',
            'SAFE'
        ]);


    if (
        !allowedIssues.has(
            issueType
        )
    ) {

        throw new Error(
            'INVALID_GIT_SAFETY_ISSUE'
        );

    }


    const allowedStatuses =
        new Set([
            'blocked',
            'decision_required',
            'pending',
            'informational',
            'resolved'
        ]);


    if (
        !allowedStatuses.has(
            status
        )
    ) {

        throw new Error(
            'INVALID_GIT_SAFETY_STATUS'
        );

    }


    return {
        issueType,

        status,

        decisionRequired:
            decisionRequired
            ===
            true,

        preservesManualChanges:
            true,

        automaticForcePush:
            false,

        untrustedHooksDisabled:
            true,

        localEvidence:
            {
                ...localEvidence
            },

        remoteEvidence:
            {
                ...remoteEvidence
            },

        metadata:
            {
                ...metadata
            }
    };

}


export function gitSafetyDefaults() {

    return {
        preserveManualChanges:
            true,

        automaticClean:
            false,

        automaticReset:
            false,

        automaticStash:
            false,

        automaticMerge:
            false,

        automaticRebase:
            false,

        automaticConflictResolution:
            false,

        automaticForcePush:
            false,

        separateLocalRemoteEvidence:
            true,

        requireDecisionOnConflict:
            true,

        requireDecisionOnRemoteDivergence:
            true,

        requireDecisionOnPermissionFailure:
            true
    };

}

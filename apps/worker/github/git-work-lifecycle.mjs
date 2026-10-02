function requiredText(
    value,
    code
) {

    const normalized =
        String(
            value
            ??
            ''
        ).trim();


    if (!normalized) {

        throw new Error(
            code
        );

    }


    return normalized;

}


export function normalizeStageKey(
    value
) {

    const stage =
        requiredText(
            value,
            'STAGE_KEY_REQUIRED'
        );


    if (
        !/^S[0-9]{2,4}$/i.test(
            stage
        )
    ) {

        throw new Error(
            'INVALID_STAGE_KEY'
        );

    }


    return stage.toUpperCase();

}


export function normalizeWorkKey(
    value
) {

    const work =
        requiredText(
            value,
            'WORK_KEY_REQUIRED'
        );


    if (
        !/^W[0-9]{2,4}(?:-[A-Z0-9]+)?$/i.test(
            work
        )
    ) {

        throw new Error(
            'INVALID_WORK_KEY'
        );

    }


    return work.toUpperCase();

}


export function stageBranchName(
    stageKey
) {

    return `stage/${normalizeStageKey(stageKey)}`;

}


export function buildWorkCommitMessage({

    stageKey,
    workKey,
    runKey,
    summary

}) {

    const stage =
        normalizeStageKey(
            stageKey
        );


    const work =
        normalizeWorkKey(
            workKey
        );


    const run =
        requiredText(
            runKey,
            'RUN_KEY_REQUIRED'
        );


    const message =
        requiredText(
            summary,
            'COMMIT_SUMMARY_REQUIRED'
        )
            .replace(
                /\s+/g,
                ' '
            );


    if (
        message.length
        >
        120
    ) {

        throw new Error(
            'COMMIT_SUMMARY_TOO_LONG'
        );

    }


    return `StagePilot ${stage}/${work} [run:${run}]: ${message}`;

}


export function verifyCommitReadiness({

    implementationVerified,
    testsVerified,
    workspaceVerified,
    implementationRef

}) {

    requiredText(
        implementationRef,
        'IMPLEMENTATION_REF_REQUIRED'
    );


    if (
        implementationVerified
        !==
        true
    ) {

        throw new Error(
            'IMPLEMENTATION_NOT_VERIFIED'
        );

    }


    if (
        testsVerified
        !==
        true
    ) {

        throw new Error(
            'TESTS_NOT_VERIFIED'
        );

    }


    if (
        workspaceVerified
        !==
        true
    ) {

        throw new Error(
            'WORKSPACE_NOT_VERIFIED'
        );

    }


    return true;

}


export function decideGitLifecycleAction({

    state,
    localCommitSha = null,
    remoteCommitSha = null

}) {

    switch (
        state
    ) {

        case 'READY_TO_COMMIT':

            return {
                action:
                    'CREATE_COMMIT',

                rerunImplementation:
                    false
            };


        case 'COMMITTED':

            if (
                !localCommitSha
            ) {

                throw new Error(
                    'COMMITTED_STATE_REQUIRES_LOCAL_SHA'
                );

            }


            return {
                action:
                    'PREPARE_PUSH',

                rerunImplementation:
                    false
            };


        case 'PUSH_INTENT':

            return {
                action:
                    'RECONCILE_PUSH',

                rerunImplementation:
                    false
            };


        case 'GIT_PENDING':

            if (
                !localCommitSha
            ) {

                throw new Error(
                    'GIT_PENDING_REQUIRES_LOCAL_SHA'
                );

            }


            return {
                action:
                    'RETRY_PUSH_ONLY',

                rerunImplementation:
                    false
            };


        case 'PUSHED':

            if (
                !localCommitSha
                ||
                !remoteCommitSha
            ) {

                throw new Error(
                    'PUSHED_STATE_REQUIRES_BOTH_SHAS'
                );

            }


            return {
                action:
                    'VERIFY_REMOTE_SHA',

                rerunImplementation:
                    false
            };


        case 'VERIFIED':

            return {
                action:
                    'COMPLETE',

                rerunImplementation:
                    false
            };


        case 'FAILED':

            return {
                action:
                    'REQUIRE_DECISION',

                rerunImplementation:
                    false
            };


        default:

            throw new Error(
                'UNKNOWN_GIT_LIFECYCLE_STATE'
            );

    }

}


export function transitionAfterCommit({

    state,
    localCommitSha

}) {

    if (
        state
        !==
        'READY_TO_COMMIT'
    ) {

        throw new Error(
            'COMMIT_TRANSITION_INVALID_STATE'
        );

    }


    requiredText(
        localCommitSha,
        'LOCAL_COMMIT_SHA_REQUIRED'
    );


    return {
        state:
            'COMMITTED',

        localCommitSha
    };

}


export function transitionBeforePush({

    state,
    localCommitSha

}) {

    if (
        state
        !==
        'COMMITTED'
        &&
        state
        !==
        'GIT_PENDING'
    ) {

        throw new Error(
            'PUSH_INTENT_INVALID_STATE'
        );

    }


    requiredText(
        localCommitSha,
        'LOCAL_COMMIT_SHA_REQUIRED'
    );


    return {
        state:
            'PUSH_INTENT',

        localCommitSha
    };

}


export function transitionAfterPushFailure({

    localCommitSha,
    reason

}) {

    requiredText(
        localCommitSha,
        'LOCAL_COMMIT_SHA_REQUIRED'
    );


    return {
        state:
            'GIT_PENDING',

        localCommitSha,

        error: {
            reason:
                requiredText(
                    reason,
                    'PUSH_FAILURE_REASON_REQUIRED'
                ),

            rerunImplementation:
                false,

            retryAction:
                'RETRY_PUSH_ONLY'
        }
    };

}


export function transitionAfterPushSuccess({

    localCommitSha,
    remoteCommitSha

}) {

    requiredText(
        localCommitSha,
        'LOCAL_COMMIT_SHA_REQUIRED'
    );


    requiredText(
        remoteCommitSha,
        'REMOTE_COMMIT_SHA_REQUIRED'
    );


    return {
        state:
            'PUSHED',

        localCommitSha,

        remoteCommitSha
    };

}


export function verifyDestinationSha({

    localCommitSha,
    remoteCommitSha

}) {

    const local =
        requiredText(
            localCommitSha,
            'LOCAL_COMMIT_SHA_REQUIRED'
        );


    const remote =
        requiredText(
            remoteCommitSha,
            'REMOTE_COMMIT_SHA_REQUIRED'
        );


    if (
        local
        !==
        remote
    ) {

        return {
            verified:
                false,

            state:
                'GIT_PENDING',

            retryAction:
                'RECONCILE_OR_RETRY_PUSH',

            rerunImplementation:
                false
        };

    }


    return {
        verified:
            true,

        state:
            'VERIFIED',

        rerunImplementation:
            false
    };

}


export function ensureSameCommitOnRetry({

    storedLocalCommitSha,
    currentLocalCommitSha

}) {

    const stored =
        requiredText(
            storedLocalCommitSha,
            'STORED_LOCAL_SHA_REQUIRED'
        );


    const current =
        requiredText(
            currentLocalCommitSha,
            'CURRENT_LOCAL_SHA_REQUIRED'
        );


    if (
        stored
        !==
        current
    ) {

        throw new Error(
            'LOCAL_COMMIT_CHANGED_DURING_GIT_PENDING'
        );

    }


    return true;

}


export function pushFailurePolicy() {

    return {
        nextState:
            'GIT_PENDING',

        retry:
            'PUSH_ONLY',

        recreateCommit:
            false,

        rerunImplementation:
            false,

        automaticForcePush:
            false
    };

}

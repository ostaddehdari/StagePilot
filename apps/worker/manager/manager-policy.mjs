export const ManagerAction =
    Object.freeze({

        PREPARE_PROMPT:
            'PREPARE_PROMPT',

        WAIT_RESPONSE:
            'WAIT_RESPONSE',

        EXTRACT_SCRIPTS:
            'EXTRACT_SCRIPTS',

        REQUIRE_DECISION:
            'REQUIRE_DECISION',

        RUN_NEXT_SCRIPT:
            'RUN_NEXT_SCRIPT',

        WAIT_RUN:
            'WAIT_RUN',

        RUN_TESTS:
            'RUN_TESTS',

        DIAGNOSE_FAILURE:
            'DIAGNOSE_FAILURE',

        VERIFY_GIT:
            'VERIFY_GIT',

        COMPLETE_SUBWORK:
            'COMPLETE_SUBWORK',

        COMPLETE_WORK:
            'COMPLETE_WORK',

        COMPLETE_STAGE:
            'COMPLETE_STAGE',

        STOP:
            'STOP'

    });


export function decideManagerAction(
    state
) {

    const s =
        state
        ??
        {};


    if (
        s.blocked === true
    ) {

        return {

            action:
                ManagerAction.REQUIRE_DECISION,

            reason:
                'explicit-blocker'

        };

    }


    if (
        s.promptRequestStatus
        ===
        'waiting_response'
    ) {

        return {

            action:
                ManagerAction.WAIT_RESPONSE,

            reason:
                'prompt-awaiting-response'

        };

    }


    if (
        s.promptRequestStatus
        ===
        'created'
        ||
        s.promptRequestStatus
        ===
        'drafted'
    ) {

        return {

            action:
                ManagerAction.PREPARE_PROMPT,

            reason:
                'prompt-not-sent'

        };

    }


    if (
        s.responseType
        ===
        'decision_required'
    ) {

        return {

            action:
                ManagerAction.REQUIRE_DECISION,

            reason:
                'ai-requested-decision'

        };

    }


    if (
        s.responseType
        ===
        'script_batch'
        &&
        s.scriptsExtracted !== true
    ) {

        return {

            action:
                ManagerAction.EXTRACT_SCRIPTS,

            reason:
                'script-batch-not-extracted'

        };

    }


    if (
        s.running === true
    ) {

        return {

            action:
                ManagerAction.WAIT_RUN,

            reason:
                'script-running'

        };

    }


    if (
        s.failedRun === true
    ) {

        return {

            action:
                ManagerAction.DIAGNOSE_FAILURE,

            reason:
                'execution-failure'

        };

    }


    if (
        s.pendingScriptCount > 0
    ) {

        return {

            action:
                ManagerAction.RUN_NEXT_SCRIPT,

            reason:
                'pending-script'

        };

    }


    if (
        s.requiresTests === true
        &&
        s.testsPassed !== true
    ) {

        return {

            action:
                ManagerAction.RUN_TESTS,

            reason:
                'verification-required'

        };

    }


    if (
        s.requiresGit === true
        &&
        s.gitVerified !== true
    ) {

        return {

            action:
                ManagerAction.VERIFY_GIT,

            reason:
                'git-gate-required'

        };

    }


    if (
        s.subworkReady === true
    ) {

        return {

            action:
                ManagerAction.COMPLETE_SUBWORK,

            reason:
                'subwork-verified'

        };

    }


    if (
        s.workReady === true
    ) {

        return {

            action:
                ManagerAction.COMPLETE_WORK,

            reason:
                'work-verified'

        };

    }


    if (
        s.stageReady === true
    ) {

        return {

            action:
                ManagerAction.COMPLETE_STAGE,

            reason:
                'stage-verified'

        };

    }


    return {

        action:
            ManagerAction.STOP,

        reason:
            'no-safe-deterministic-action'

    };

}

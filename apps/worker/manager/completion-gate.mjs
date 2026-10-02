export function evaluateCompletionGate(
    state
) {

    const blockers = [];


    if (
        state.prerequisitesPassed
        !==
        true
    ) {

        blockers.push(
            'prerequisites-not-passed'
        );

    }


    if (
        state.requiredTestsPassed
        !==
        true
    ) {

        blockers.push(
            'required-tests-not-passed'
        );

    }


    if (
        state.batchCompleted
        !==
        true
    ) {

        blockers.push(
            'batch-not-completed'
        );

    }


    if (
        Number(
            state.realFailedExecutions
            ??
            0
        )
        !==
        0
    ) {

        blockers.push(
            'real-execution-failures'
        );

    }


    if (
        Number(
            state.activeRuns
            ??
            0
        )
        !==
        0
    ) {

        blockers.push(
            'active-runs-remain'
        );

    }


    if (
        state.browserStateUnchanged
        !==
        true
    ) {

        blockers.push(
            'browser-state-changed'
        );

    }


    if (
        state.gitVerified
        !==
        true
    ) {

        blockers.push(
            'git-not-verified'
        );

    }


    const ready =
        blockers.length === 0;


    return {

        ready,

        action:
            ready
                ?
                'COMPLETE_STAGE'
                :
                'STOP',

        blockers

    };

}

export const RolloverAction =
    Object.freeze({

        PREPARE_HANDOFF:
            'PREPARE_HANDOFF',

        CREATE_NEW_CHAT:
            'CREATE_NEW_CHAT',

        RESTORE_DRAFT:
            'RESTORE_DRAFT',

        RECONCILE_ONLY:
            'RECONCILE_ONLY',

        WAIT_RESPONSE:
            'WAIT_RESPONSE',

        CONTINUE_ACTIVE:
            'CONTINUE_ACTIVE',

        DONE:
            'DONE',

        STOP:
            'STOP'

    });


const POST_CLICK_REQUEST_STATES =
    new Set([

        'send_intent',

        'send_uncertain',

        'sent',

        'waiting_response'

    ]);


export function decideRolloverRecovery({

    sourceStatus,

    continuationStatus = null,

    requestStatus = null,

    sendAttempts = 0,

    browserState = null,

    clickCount = 0,

    responseComplete = false

}) {

    const source =
        String(
            sourceStatus
            ??
            ''
        );


    const continuation =
        continuationStatus
        === null
        ||
        continuationStatus
        === undefined
        ||
        continuationStatus
        === ''
        ? null
        : String(
            continuationStatus
        );


    const request =
        requestStatus
        === null
        ||
        requestStatus
        === undefined
        ||
        requestStatus
        === ''
        ? null
        : String(
            requestStatus
        );


    const browser =
        browserState
        === null
        ||
        browserState
        === undefined
        ||
        browserState
        === ''
        ? null
        : String(
            browserState
        );


    const attempts =
        Number(
            sendAttempts
            ??
            0
        );


    const clicks =
        Number(
            clickCount
            ??
            0
        );


    if (
        responseComplete
        ||
        request === 'completed'
    ) {

        return {

            action:
                RolloverAction.DONE,

            maySend:
                false,

            reason:
                'continuation-complete'

        };

    }


    if (
        source !== 'closed'
    ) {

        return {

            action:
                RolloverAction.STOP,

            maySend:
                false,

            reason:
                'source-conversation-not-closed'

        };

    }


    if (
        continuation === null
        &&
        request === null
    ) {

        return {

            action:
                RolloverAction.PREPARE_HANDOFF,

            maySend:
                false,

            reason:
                'rollover-not-prepared'

        };

    }


    if (
        clicks > 0
        ||
        attempts > 0
        ||
        POST_CLICK_REQUEST_STATES.has(
            request
        )
        ||
        browser === 'SEND_INTENT'
        ||
        browser === 'CLICK'
        ||
        browser === 'SEND_UNCERTAIN'
    ) {

        if (
            request === 'waiting_response'
            ||
            browser === 'SENT_CONFIRMED'
        ) {

            return {

                action:
                    RolloverAction.WAIT_RESPONSE,

                maySend:
                    false,

                reason:
                    'continuation-send-confirmed'

            };

        }


        return {

            action:
                RolloverAction.RECONCILE_ONLY,

            maySend:
                false,

            reason:
                'possible-continuation-click'

        };

    }


    if (
        continuation === 'pending_creation'
        &&
        request === 'created'
    ) {

        return {

            action:
                RolloverAction.CREATE_NEW_CHAT,

            maySend:
                false,

            reason:
                'db-first-rollover-ready'

        };

    }


    if (
        continuation === 'pending_creation'
        &&
        request === 'drafted'
        &&
        browser === 'DRAFT'
    ) {

        return {

            action:
                RolloverAction.RESTORE_DRAFT,

            maySend:
                false,

            reason:
                'pre-click-draft-recovery'

        };

    }


    if (
        continuation === 'active'
        &&
        request === 'waiting_response'
    ) {

        return {

            action:
                RolloverAction.CONTINUE_ACTIVE,

            maySend:
                false,

            reason:
                'continuation-active'

        };

    }


    return {

        action:
            RolloverAction.STOP,

        maySend:
            false,

        reason:
            'rollover-state-not-proven-safe'

    };

}


export function assertNoBlindRolloverSend(
    decision
) {

    if (
        decision?.maySend
        ===
        true
    ) {

        throw new Error(
            'ROLLOVER_BLIND_SEND_POLICY_VIOLATION'
        );

    }


    return true;

}

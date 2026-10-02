export const BrowserRequestRecoveryAction =
    Object.freeze({

        SAFE_TO_DRAFT:
            'SAFE_TO_DRAFT',

        RECONCILE_ONLY:
            'RECONCILE_ONLY',

        WAIT_RESPONSE:
            'WAIT_RESPONSE',

        DONE:
            'DONE',

        STOP:
            'STOP'

    });


const POST_CLICK_BROWSER_STATES =
    new Set([

        'SEND_INTENT',

        'CLICK',

        'SEND_UNCERTAIN',

        'SENT_CONFIRMED'

    ]);


const POST_CLICK_DB_STATES =
    new Set([

        'send_intent',

        'send_uncertain',

        'sent',

        'waiting_response',

        'response_received'

    ]);


export function decideBrowserRequestRecovery({

    dbStatus,

    browserState = null,

    clickCount = 0,

    sameOperation = true,

    responseComplete = false

}) {

    const normalizedDb =
        String(
            dbStatus
            ??
            ''
        );


    const normalizedBrowser =
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


    const clicks =
        Number(
            clickCount
            ??
            0
        );


    if (
        responseComplete
        ||
        normalizedDb
        ===
        'completed'
    ) {

        return {

            action:
                BrowserRequestRecoveryAction.DONE,

            maySend:
                false,

            reason:
                'request-complete'

        };

    }


    /*
     * State left by another already-completed operation does
     * not block a fresh DB-persisted request.
     */
    if (
        !sameOperation
        &&
        (
            normalizedBrowser
            ===
            'SENT_CONFIRMED'
            ||
            normalizedBrowser
            ===
            null
        )
        &&
        (
            normalizedDb
            ===
            'created'
            ||
            normalizedDb
            ===
            'drafted'
        )
    ) {

        return {

            action:
                BrowserRequestRecoveryAction.SAFE_TO_DRAFT,

            maySend:
                false,

            reason:
                'foreign-completed-browser-state'

        };

    }


    /*
     * Any evidence that a click may have happened switches
     * the system permanently into observation/reconciliation.
     *
     * No blind resend is permitted.
     */
    if (
        clicks > 0
        ||
        POST_CLICK_BROWSER_STATES.has(
            normalizedBrowser
        )
        ||
        POST_CLICK_DB_STATES.has(
            normalizedDb
        )
    ) {

        if (
            normalizedDb
            ===
            'sent'
            ||
            normalizedDb
            ===
            'waiting_response'
            ||
            normalizedBrowser
            ===
            'SENT_CONFIRMED'
        ) {

            return {

                action:
                    BrowserRequestRecoveryAction.WAIT_RESPONSE,

                maySend:
                    false,

                reason:
                    'send-confirmed-or-response-pending'

            };

        }


        return {

            action:
                BrowserRequestRecoveryAction.RECONCILE_ONLY,

            maySend:
                false,

            reason:
                'possible-post-click-state'

        };

    }


    if (
        (
            normalizedDb
            ===
            'created'
            ||
            normalizedDb
            ===
            'drafted'
        )
        &&
        (
            normalizedBrowser
            ===
            null
            ||
            normalizedBrowser
            ===
            'DRAFT'
        )
    ) {

        return {

            action:
                BrowserRequestRecoveryAction.SAFE_TO_DRAFT,

            maySend:
                false,

            reason:
                'provably-pre-click'

        };

    }


    return {

        action:
            BrowserRequestRecoveryAction.STOP,

        maySend:
            false,

        reason:
            'state-not-proven-safe'

    };

}


export function assertNoBlindRetry(
    decision
) {

    if (
        decision?.maySend
        ===
        true
    ) {

        throw new Error(
            'BLIND_RETRY_POLICY_VIOLATION'
        );

    }


    return true;

}

'use server';


import {
    revalidatePath
} from 'next/cache';


import {
    redirect
} from 'next/navigation';


import {
    completeChatAccountBrowserLogin,
    startChatAccountBrowserLogin,
    stopChatAccountBrowserLogin,
    stopChatAccountHeadless
} from '../../../../lib/chat-accounts';


export async function startLoginAction(
    accountId: string
) {

    try {

        await startChatAccountBrowserLogin(
            accountId
        );

    } catch {

        redirect(
            `/chat-accounts/${accountId}?error=start-login`
        );

    }


    revalidatePath(
        `/chat-accounts/${accountId}`
    );


    redirect(
        `/chat-accounts/${accountId}?login=started`
    );

}


export async function completeLoginAction(
    accountId: string
) {

    let result;


    try {

        result =
            await completeChatAccountBrowserLogin(
                accountId
            );

    } catch {

        redirect(
            `/chat-accounts/${accountId}?error=complete-login`
        );

    }


    revalidatePath(
        `/chat-accounts/${accountId}`
    );


    if (
        result.transitioned
        &&
        result.authState
        ===
        'authenticated'
    ) {

        redirect(
            `/chat-accounts/${accountId}?transition=success`
        );

    }


    redirect(
        `/chat-accounts/${accountId}?transition=${encodeURIComponent(
            result.authState
            ??
            'unknown'
        )}`
    );

}


export async function stopLoginAction(
    accountId: string
) {

    try {

        await stopChatAccountBrowserLogin(
            accountId
        );

    } catch {

        redirect(
            `/chat-accounts/${accountId}?error=stop-login`
        );

    }


    revalidatePath(
        `/chat-accounts/${accountId}`
    );


    redirect(
        `/chat-accounts/${accountId}?login=stopped`
    );

}


export async function stopHeadlessAction(
    accountId: string
) {

    try {

        await stopChatAccountHeadless(
            accountId
        );

    } catch {

        redirect(
            `/chat-accounts/${accountId}?error=stop-headless`
        );

    }


    revalidatePath(
        `/chat-accounts/${accountId}`
    );


    redirect(
        `/chat-accounts/${accountId}?headless=stopped`
    );

}

'use server';


import {
    revalidatePath
} from 'next/cache';


import {
    redirect
} from 'next/navigation';


import {
    createChatAccountRequest,
    deleteChatAccountRequest,
    updateChatAccountRequest
} from '../../../lib/chat-accounts';


export async function createChatAccountAction(
    formData: FormData
) {

    const label =
        String(
            formData.get('label')
            ??
            ''
        ).trim();


    const note =
        String(
            formData.get('note')
            ??
            ''
        ).trim();


    let accountId:
        string | null = null;


    try {

        const account =
            await createChatAccountRequest({

                label,

                note

            });


        accountId =
            account.id;

    } catch {

        redirect(
            '/chat-accounts?error=create'
        );

    }


    revalidatePath(
        '/chat-accounts'
    );


    redirect(
        `/chat-accounts/${accountId}`
    );

}


export async function updateChatAccountAction(
    accountId: string,
    formData: FormData
) {
    const label = String(formData.get('label') ?? '').trim();
    const note = String(formData.get('note') ?? '').trim();
    try {
        await updateChatAccountRequest(accountId, { label, note });
    } catch {
        redirect('/chat-accounts?error=update');
    }
    revalidatePath('/chat-accounts');
    revalidatePath(`/chat-accounts/${accountId}`);
    redirect('/chat-accounts?success=update');
}


export async function deleteChatAccountAction(
    accountId: string
) {
    try {
        await deleteChatAccountRequest(accountId);
    } catch {
        redirect('/chat-accounts?error=delete');
    }
    revalidatePath('/chat-accounts');
    redirect('/chat-accounts?success=delete');
}

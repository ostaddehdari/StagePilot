'use server';


import {
    revalidatePath
} from 'next/cache';


import {
    redirect
} from 'next/navigation';


import {
    createChatAccountRequest
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

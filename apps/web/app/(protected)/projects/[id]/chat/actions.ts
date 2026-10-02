'use server';


import {
    revalidatePath
} from 'next/cache';


import {
    redirect
} from 'next/navigation';


import {
    registerProjectConversationRequest,
    selectProjectChatAccountRequest
} from '../../../../../lib/project-chat';


export async function selectChatAccountAction(
    projectId: string,
    formData: FormData
) {

    const chatAccountId =
        String(
            formData.get(
                'chatAccountId'
            )
            ??
            ''
        ).trim();


    try {

        await selectProjectChatAccountRequest(
            projectId,
            chatAccountId
        );

    } catch {

        redirect(
            `/projects/${projectId}/chat?error=account`
        );

    }


    revalidatePath(
        `/projects/${projectId}/chat`
    );


    redirect(
        `/projects/${projectId}/chat?success=account`
    );

}


export async function registerExistingConversationAction(
    projectId: string,
    formData: FormData
) {

    const externalUrl =
        String(
            formData.get(
                'externalUrl'
            )
            ??
            ''
        ).trim();


    const externalChatId =
        String(
            formData.get(
                'externalChatId'
            )
            ??
            ''
        ).trim();


    try {

        await registerProjectConversationRequest(
            projectId,
            {

                mode:
                    'existing',

                externalUrl,

                externalChatId:
                    externalChatId
                    ||
                    undefined,

                startedReason:
                    'existing_chat_registered_by_user'

            }
        );

    } catch {

        redirect(
            `/projects/${projectId}/chat?error=conversation`
        );

    }


    revalidatePath(
        `/projects/${projectId}/chat`
    );


    redirect(
        `/projects/${projectId}/chat?success=conversation`
    );

}


export async function requestNewConversationAction(
    projectId: string
) {

    try {

        await registerProjectConversationRequest(
            projectId,
            {

                mode:
                    'new',

                startedReason:
                    'new_chat_requested_by_user'

            }
        );

    } catch {

        redirect(
            `/projects/${projectId}/chat?error=new-chat`
        );

    }


    revalidatePath(
        `/projects/${projectId}/chat`
    );


    redirect(
        `/projects/${projectId}/chat?success=new-chat`
    );

}

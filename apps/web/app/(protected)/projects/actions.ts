'use server';


import {
    revalidatePath
} from 'next/cache';


import {
    redirect
} from 'next/navigation';


import {
    createProjectRequest,
    deleteProjectRequest,
    updateProjectRequest
} from '../../../lib/projects';

import {
    requestPlanningEvaluationRequest
} from '../../../lib/planning';


export async function createProjectAction(
    formData: FormData
) {

    const name =
        String(
            formData.get('name')
            ??
            ''
        ).trim();


    const slug =
        String(
            formData.get('slug')
            ??
            ''
        ).trim();


    const description =
        String(
            formData.get('description')
            ??
            ''
        ).trim();


    const requestText =
        String(
            formData.get('requestText')
            ??
            ''
        ).trim();


    let projectId:
        string | null = null;


    try {

        const project =
            await createProjectRequest({

                name,

                slug,

                description,

                requestText

            });


        projectId =
            project.id;

    } catch {

        redirect(
            '/projects?error=create'
        );

    }


    revalidatePath(
        '/projects'
    );


    let planningQueued = false;


    try {

        await requestPlanningEvaluationRequest(
            String(projectId)
        );


        planningQueued = true;

    } catch {

        planningQueued = false;

    }


    redirect(
        `/projects/${projectId}/planning?${planningQueued ? 'success=created-and-queued' : 'error=chat-account-required'}`
    );

}


export async function updateProjectAction(
    projectId: string,
    formData: FormData
) {
    const payload = {
        name: String(formData.get('name') ?? '').trim(),
        slug: String(formData.get('slug') ?? '').trim(),
        description: String(formData.get('description') ?? '').trim(),
        status: String(formData.get('status') ?? 'draft').trim(),
        repositoryName: String(formData.get('repositoryName') ?? '').trim(),
        chatMode: String(formData.get('chatMode') ?? 'existing').trim()
    };
    try {
        await updateProjectRequest(projectId, payload);
    } catch {
        redirect('/projects?error=update');
    }
    revalidatePath('/projects');
    revalidatePath(`/projects/${projectId}`);
    redirect('/projects?success=update');
}


export async function deleteProjectAction(
    projectId: string
) {
    try {
        await deleteProjectRequest(projectId);
    } catch {
        redirect('/projects?error=delete');
    }
    revalidatePath('/projects');
    redirect('/projects?success=delete');
}

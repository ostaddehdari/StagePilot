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

import { controlProjectAutomationRequest } from '../../../lib/automation';

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


    redirect(
        `/projects/${projectId}?tab=settings&success=created`
    );

}


export async function pauseProjectAction(
    projectId: string,
    formData: FormData
) {
    try {
        await updateProjectRequest(projectId, {
            name: String(formData.get('name') ?? '').trim(),
            slug: String(formData.get('slug') ?? '').trim(),
            description: String(formData.get('description') ?? '').trim(),
            status: 'paused',
            repositoryName: String(formData.get('repositoryName') ?? '').trim(),
            chatMode: String(formData.get('chatMode') ?? 'existing').trim()
        });
        await controlProjectAutomationRequest(projectId, 'pause');
    } catch {
        redirect('/projects?error=pause');
    }
    revalidatePath('/projects');
    revalidatePath(`/projects/${projectId}`);
    redirect('/projects?success=pause');
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

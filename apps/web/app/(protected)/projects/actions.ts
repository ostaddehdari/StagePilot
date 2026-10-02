'use server';


import {
    revalidatePath
} from 'next/cache';


import {
    redirect
} from 'next/navigation';


import {
    createProjectRequest
} from '../../../lib/projects';


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
        `/projects/${projectId}`
    );

}

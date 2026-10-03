'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { controlProjectAutomationRequest } from '../../../../lib/automation';

export async function controlAutomationAction(projectId: string, action: string) {
    try {
        await controlProjectAutomationRequest(projectId, action);
    } catch {
        redirect(`/projects/${projectId}?error=automation`);
    }
    revalidatePath(`/projects/${projectId}`);
    redirect(`/projects/${projectId}?success=automation-${action}`);
}

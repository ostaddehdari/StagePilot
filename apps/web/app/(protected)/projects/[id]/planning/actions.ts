'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import {
    addPlanningMessageRequest,
    approveProjectPlanRequest,
    importProjectPlanRequest,
    requestPlanningEvaluationRequest
} from '../../../../../lib/planning';


export async function addPlanningCommentAction(
    projectId: string,
    formData: FormData
) {
    const content = String(formData.get('content') ?? '').trim();
    try {
        await addPlanningMessageRequest(projectId, content);
    } catch {
        redirect(`/projects/${projectId}/planning?error=comment`);
    }
    revalidatePath(`/projects/${projectId}/planning`);
    redirect(`/projects/${projectId}/planning?success=comment`);
}


export async function requestPlanningEvaluationAction(
    projectId: string
) {
    try {
        await requestPlanningEvaluationRequest(projectId);
    } catch {
        redirect(`/projects/${projectId}/planning?error=evaluate`);
    }
    revalidatePath(`/projects/${projectId}/planning`);
    redirect(`/projects/${projectId}/planning?success=evaluate`);
}


export async function importProjectPlanAction(
    projectId: string,
    formData: FormData
) {
    const rawJson = String(formData.get('rawJson') ?? '').trim();
    try {
        await importProjectPlanRequest(projectId, rawJson);
    } catch {
        redirect(`/projects/${projectId}/planning?error=import`);
    }
    revalidatePath(`/projects/${projectId}/planning`);
    redirect(`/projects/${projectId}/planning?success=import`);
}


export async function approveProjectPlanAction(
    projectId: string,
    version: number
) {
    try {
        await approveProjectPlanRequest(projectId, version);
    } catch {
        redirect(`/projects/${projectId}/planning?error=approve`);
    }
    revalidatePath(`/projects/${projectId}/planning`);
    revalidatePath(`/projects/${projectId}`);
    redirect(`/projects/${projectId}?success=plan-approved`);
}

'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { updateSiteSettingsRequest } from '../../../lib/site-settings';


export async function updateSiteSettingsAction(
    formData: FormData
) {
    const payload = {
        githubOwner: String(formData.get('githubOwner') ?? '').trim(),
        githubUsername: String(formData.get('githubUsername') ?? '').trim(),
        githubToken: String(formData.get('githubToken') ?? '').trim(),
        githubPassword: String(formData.get('githubPassword') ?? ''),
        defaultRepository: String(formData.get('defaultRepository') ?? '').trim(),
        defaultVisibility: String(formData.get('defaultVisibility') ?? 'private').trim()
    };
    try {
        await updateSiteSettingsRequest(payload);
    } catch {
        redirect('/settings?error=save');
    }
    revalidatePath('/settings');
    redirect('/settings?success=save');
}

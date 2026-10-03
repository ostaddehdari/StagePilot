import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

import {
    SESSION_COOKIE,
    verifySessionToken
} from '../../../../lib/auth';
import { createProjectRequest } from '../../../../lib/projects';


export const runtime = 'nodejs';


function publicOrigin(): string {
    const origin = process.env.STAGEPILOT_PUBLIC_ORIGIN;
    if (!origin) {
        throw new Error('STAGEPILOT_PUBLIC_ORIGIN is required');
    }
    return origin.replace(/\/+$/, '');
}


function publicUrl(pathname: string): URL {
    return new URL(pathname, `${publicOrigin()}/`);
}


function sameOrigin(request: NextRequest): boolean {
    const origin = request.headers.get('origin');
    if (!origin) {
        return false;
    }
    try {
        return new URL(origin).origin === new URL(publicOrigin()).origin;
    } catch {
        return false;
    }
}


function projectsRedirect(parameters: Record<string, string>): NextResponse {
    const url = publicUrl('/StagePilot/projects');
    for (const [key, value] of Object.entries(parameters)) {
        url.searchParams.set(key, value);
    }
    return NextResponse.redirect(url, 303);
}


export async function POST(request: NextRequest) {
    const cookieStore = await cookies();
    const token = cookieStore.get(SESSION_COOKIE)?.value;

    if (!verifySessionToken(token)) {
        return NextResponse.redirect(
            publicUrl('/StagePilot/login?error=session-expired'),
            303
        );
    }

    if (!sameOrigin(request)) {
        console.error('[project-create] rejected request with invalid origin');
        return projectsRedirect({ error: 'csrf' });
    }

    const formData = await request.formData();
    const payload = {
        name: String(formData.get('name') ?? '').trim(),
        slug: String(formData.get('slug') ?? '').trim(),
        description: String(formData.get('description') ?? '').trim(),
        requestText: String(formData.get('requestText') ?? '').trim()
    };

    let project: Awaited<ReturnType<typeof createProjectRequest>>;

    try {
        project = await createProjectRequest(payload);
    } catch (error) {
        const reason = error instanceof Error
            ? error.message
            : 'PROJECT_CREATE_FAILED';
        console.error('[project-create] API creation failed:', reason);
        return projectsRedirect({ error: 'create', reason });
    }

    return NextResponse.redirect(
        publicUrl(`/StagePilot/projects/${project.id}?tab=settings&success=created`),
        303
    );
}

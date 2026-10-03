import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

import { SESSION_COOKIE, verifySessionToken } from '../../../../../lib/auth';
import { loadPlanningWorkspace } from '../../../../../lib/planning';


export const runtime = 'nodejs';

export async function GET(
    _request: Request,
    context: { params: Promise<{ id: string }> }
) {
    const cookieStore = await cookies();
    if (!verifySessionToken(cookieStore.get(SESSION_COOKIE)?.value)) {
        return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
    }
    const { id } = await context.params;
    const workspace = await loadPlanningWorkspace(id);
    const latest = workspace?.plans[0];
    if (!workspace || !latest) {
        return NextResponse.json({ error: 'PLAN_NOT_FOUND' }, { status: 404 });
    }
    return new NextResponse(
        JSON.stringify(latest.proposal_json, null, 2),
        {
            status: 200,
            headers: {
                'content-type': 'application/json; charset=utf-8',
                'content-disposition': `attachment; filename="${workspace.project.slug}-plan-v${latest.version}.json"`,
                'cache-control': 'no-store'
            }
        }
    );
}

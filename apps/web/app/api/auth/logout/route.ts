import {
    NextRequest,
    NextResponse
} from 'next/server';


import {
    SESSION_COOKIE
} from '../../../../lib/auth';


export const runtime =
    'nodejs';


function publicOrigin(): string {

    const origin =
        process.env.STAGEPILOT_PUBLIC_ORIGIN;


    if (!origin) {

        throw new Error(
            'STAGEPILOT_PUBLIC_ORIGIN is required'
        );

    }


    return origin.replace(
        /\/+$/,
        ''
    );

}


export async function POST(
    request: NextRequest
) {

    const origin = request.headers.get('origin');
    let validOrigin = false;
    try {
        validOrigin = Boolean(origin) && new URL(origin as string).origin === new URL(publicOrigin()).origin;
    } catch {
        validOrigin = false;
    }

    if (!validOrigin) {
        return NextResponse.json(
            { error: 'CSRF_ORIGIN_MISMATCH' },
            { status: 403 }
        );
    }

    const response =
        NextResponse.redirect(

            new URL(
                '/StagePilot/login',
                `${publicOrigin()}/`
            ),

            303

        );


    response.cookies.set({

        name:
            SESSION_COOKIE,

        value:
            '',

        httpOnly:
            true,

        secure:
            process.env.STAGEPILOT_COOKIE_SECURE
            !==
            '0',

        sameSite:
            'strict',

        path:
            '/StagePilot',

        maxAge:
            0

    });


    return response;

}

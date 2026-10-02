import {
    NextRequest,
    NextResponse
} from 'next/server';


import {
    createSessionToken,
    SESSION_COOKIE,
    verifyAdminCredentials
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


function publicUrl(
    pathname: string
): URL {

    return new URL(
        pathname,
        `${publicOrigin()}/`
    );

}


function loginUrl(
    error?: string
): URL {

    const url =
        publicUrl(
            '/StagePilot/login'
        );


    if (error) {

        url.searchParams.set(
            'error',
            error
        );

    }


    return url;

}


export async function POST(
    request: NextRequest
) {

    const form =
        await request.formData();


    const username =
        String(
            form.get('username') ?? ''
        ).trim();


    const password =
        String(
            form.get('password') ?? ''
        );


    if (
        !username
        ||
        !password
    ) {

        return NextResponse.redirect(
            loginUrl(
                'missing'
            ),
            303
        );

    }


    if (
        !verifyAdminCredentials(
            username,
            password
        )
    ) {

        return NextResponse.redirect(
            loginUrl(
                'invalid'
            ),
            303
        );

    }


    const response =
        NextResponse.redirect(
            publicUrl(
                '/StagePilot'
            ),
            303
        );


    response.cookies.set({

        name:
            SESSION_COOKIE,

        value:
            createSessionToken(),

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
            8 * 60 * 60

    });


    return response;

}

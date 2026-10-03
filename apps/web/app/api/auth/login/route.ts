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


type Attempt = {
    count: number;
    resetAt: number;
};


const loginAttempts = new Map<string, Attempt>();


function requestKey(
    request: NextRequest,
    username: string
) {
    const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
    const real = request.headers.get('x-real-ip')?.trim();
    return `${forwarded || real || 'unknown'}:${username.toLowerCase()}`;
}


function sameOrigin(
    request: NextRequest
) {
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

    if (!sameOrigin(request)) {
        return NextResponse.redirect(loginUrl('csrf'), 303);
    }

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


    const key = requestKey(request, username);
    const now = Date.now();
    const current = loginAttempts.get(key);

    if (current && current.resetAt > now && current.count >= 5) {
        return NextResponse.redirect(loginUrl('rate-limit'), 303);
    }

    if (current && current.resetAt <= now) {
        loginAttempts.delete(key);
    }


    if (
        !verifyAdminCredentials(
            username,
            password
        )
    ) {

        const attempt = loginAttempts.get(key);
        loginAttempts.set(key, {
            count: (attempt?.count ?? 0) + 1,
            resetAt: attempt?.resetAt ?? now + (15 * 60 * 1000)
        });

        return NextResponse.redirect(
            loginUrl(
                'invalid'
            ),
            303
        );

    }


    loginAttempts.delete(key);


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

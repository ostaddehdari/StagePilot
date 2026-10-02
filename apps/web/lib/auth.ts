import {
    createHmac,
    scryptSync,
    timingSafeEqual
} from 'node:crypto';


export const SESSION_COOKIE = 'stagepilot_session';


type SessionPayload = {

    sub: 'admin';

    exp: number;

};


function required(name: string): string {

    const value = process.env[name];

    if (!value) {

        throw new Error(
            `Missing required environment variable: ${name}`
        );

    }

    return value;

}


function safeEqualText(
    a: string,
    b: string
): boolean {

    const left = Buffer.from(a);

    const right = Buffer.from(b);


    if (left.length !== right.length) {

        return false;

    }


    return timingSafeEqual(
        left,
        right
    );

}


export function verifyAdminCredentials(
    username: string,
    password: string
): boolean {

    const expectedUsername =
        required('STAGEPILOT_ADMIN_USERNAME');


    const salt =
        required('STAGEPILOT_ADMIN_PASSWORD_SALT');


    const expectedHash =
        required('STAGEPILOT_ADMIN_PASSWORD_HASH');


    if (!safeEqualText(
        username,
        expectedUsername
    )) {

        return false;

    }


    const actualHash = scryptSync(
        password,
        salt,
        64
    ).toString('hex');


    const left = Buffer.from(
        actualHash,
        'hex'
    );


    const right = Buffer.from(
        expectedHash,
        'hex'
    );


    if (left.length !== right.length) {

        return false;

    }


    return timingSafeEqual(
        left,
        right
    );

}


export function createSessionToken(): string {

    const secret =
        required('STAGEPILOT_SESSION_SECRET');


    const payload: SessionPayload = {

        sub: 'admin',

        exp:
            Math.floor(
                Date.now() / 1000
            )
            +
            (8 * 60 * 60)

    };


    const body = Buffer
        .from(
            JSON.stringify(payload)
        )
        .toString('base64url');


    const signature =
        createHmac(
            'sha256',
            secret
        )
        .update(body)
        .digest('base64url');


    return `${body}.${signature}`;

}


export function verifySessionToken(
    token?: string
): boolean {

    if (!token) {

        return false;

    }


    const secret =
        required('STAGEPILOT_SESSION_SECRET');


    const parts =
        token.split('.');


    if (parts.length !== 2) {

        return false;

    }


    const [
        body,
        suppliedSignature
    ] = parts;


    const expectedSignature =
        createHmac(
            'sha256',
            secret
        )
        .update(body)
        .digest('base64url');


    if (!safeEqualText(
        suppliedSignature,
        expectedSignature
    )) {

        return false;

    }


    try {

        const payload =
            JSON.parse(
                Buffer
                    .from(
                        body,
                        'base64url'
                    )
                    .toString('utf8')
            ) as SessionPayload;


        if (payload.sub !== 'admin') {

            return false;

        }


        if (!Number.isFinite(
            payload.exp
        )) {

            return false;

        }


        if (
            payload.exp
            <=
            Math.floor(
                Date.now() / 1000
            )
        ) {

            return false;

        }


        return true;

    } catch {

        return false;

    }

}

const CHALLENGE_PATTERNS = [

    /checking your browser/i,

    /verify you are human/i,

    /security verification/i,

    /cloudflare/i,

    /just a moment/i

];


const LOGIN_TEXT_PATTERNS = [

    /^log in$/i,

    /^login$/i,

    /^sign in$/i,

    /^ورود$/i

];


const SIGNUP_TEXT_PATTERNS = [

    /^sign up$/i,

    /^create account$/i,

    /^ثبت.?نام$/i

];


function includesPattern(
    value,
    patterns
) {

    return patterns.some(
        pattern =>
            pattern.test(
                value
            )
    );

}


export async function validateChatGPTPage(
    page
) {

    const url =
        page.url();


    const title =
        await page.title()
            .catch(
                () => ''
            );


    const snapshot =
        await page.evaluate(
            () => {

                const text =
                    (
                        document.body
                            ?.innerText
                        ??
                        ''
                    ).slice(
                        0,
                        50000
                    );


                const interactive =
                    Array.from(
                        document.querySelectorAll(
                            'a,button'
                        )
                    )
                        .slice(
                            0,
                            1000
                        )
                        .map(
                            element => ({

                                text:
                                    (
                                        element.textContent
                                        ??
                                        ''
                                    )
                                        .trim()
                                        .replace(
                                            /\s+/g,
                                            ' '
                                        )
                                        .slice(
                                            0,
                                            200
                                        ),

                                href:
                                    element instanceof HTMLAnchorElement
                                    ? element.href
                                    : '',

                                aria:
                                    element.getAttribute(
                                        'aria-label'
                                    )
                                    ??
                                    '',

                                testId:
                                    element.getAttribute(
                                        'data-testid'
                                    )
                                    ??
                                    ''

                            })
                        );


                const profileSelectors = [

                    '[data-testid="profile-button"]',

                    '[data-testid="accounts-profile-button"]',

                    '[data-testid*="profile" i]',

                    'button[aria-label*="profile" i]',

                    'button[aria-label*="account" i]',

                    'button[aria-label*="settings" i]'

                ];


                const profileIndicators =
                    profileSelectors
                        .filter(
                            selector => {

                                try {

                                    return Boolean(
                                        document.querySelector(
                                            selector
                                        )
                                    );

                                } catch {

                                    return false;

                                }

                            }
                        );


                return {

                    text,

                    interactive,

                    profileIndicators

                };

            }
        );


    const lowerUrl =
        url.toLowerCase();


    const urlNeedsLogin =
        lowerUrl.includes(
            '/auth/login'
        )
        ||
        lowerUrl.includes(
            '/auth/signin'
        )
        ||
        lowerUrl.includes(
            '/login'
        );


    const challengeText =
        `${title}\n${snapshot.text}`;


    const challenge =
        includesPattern(
            challengeText,
            CHALLENGE_PATTERNS
        );


    const loginInteractive =
        snapshot.interactive
            .filter(
                item => {

                    const text =
                        item.text.trim();


                    const href =
                        item.href
                            .toLowerCase();


                    return (
                        includesPattern(
                            text,
                            LOGIN_TEXT_PATTERNS
                        )
                        ||
                        includesPattern(
                            text,
                            SIGNUP_TEXT_PATTERNS
                        )
                        ||
                        href.includes(
                            '/auth/login'
                        )
                        ||
                        href.includes(
                            '/auth/signup'
                        )
                    );

                }
            );


    const profileEvidence =
        snapshot.profileIndicators
            .length > 0;


    let sessionProbe = {

        available:
            false,

        authenticated:
            false,

        unauthenticated:
            false,

        status:
            null,

        reason:
            null

    };


    try {

        const current =
            new URL(
                url
            );


        if (
            current.hostname === 'chatgpt.com'
            ||
            current.hostname.endsWith(
                '.chatgpt.com'
            )
        ) {

            sessionProbe =
                await page.evaluate(
                    async () => {

                        try {

                            const response =
                                await fetch(
                                    '/api/auth/session',
                                    {
                                        credentials:
                                            'include',

                                        cache:
                                            'no-store'
                                    }
                                );


                            if (
                                !response.ok
                            ) {

                                return {

                                    available:
                                        false,

                                    authenticated:
                                        false,

                                    unauthenticated:
                                        false,

                                    status:
                                        response.status,

                                    reason:
                                        'non-success-response'

                                };

                            }


                            const data =
                                await response.json();


                            const user =
                                data
                                &&
                                typeof data === 'object'
                                &&
                                (
                                    data.user
                                    ||
                                    data.account
                                );


                            const authenticated =
                                Boolean(
                                    user
                                    ||
                                    data?.accessToken
                                );


                            const clearlyEmpty =
                                !authenticated
                                &&
                                (
                                    data === null
                                    ||
                                    (
                                        typeof data === 'object'
                                        &&
                                        Object.keys(
                                            data
                                        ).length === 0
                                    )
                                );


                            return {

                                available:
                                    true,

                                authenticated,

                                unauthenticated:
                                    clearlyEmpty,

                                status:
                                    response.status,

                                reason:
                                    authenticated
                                    ? 'session-object'
                                    : clearlyEmpty
                                        ? 'empty-session'
                                        : 'ambiguous-session'

                            };

                        } catch {

                            return {

                                available:
                                    false,

                                authenticated:
                                    false,

                                unauthenticated:
                                    false,

                                status:
                                    null,

                                reason:
                                    'probe-error'

                            };

                        }

                    }
                );

        }

    } catch {}


    let state =
        'unknown';


    let confidence =
        0.25;


    const evidence = [];


    if (challenge) {

        state =
            'challenge';

        confidence =
            0.95;

        evidence.push(
            'challenge-markers'
        );

    } else if (
        sessionProbe.authenticated
    ) {

        state =
            'authenticated';

        confidence =
            0.99;

        evidence.push(
            'authenticated-session-probe'
        );

    } else if (
        profileEvidence
        &&
        loginInteractive.length === 0
    ) {

        state =
            'authenticated';

        confidence =
            0.85;

        evidence.push(
            'profile-control'
        );

    } else if (
        urlNeedsLogin
    ) {

        state =
            'needs_login';

        confidence =
            0.99;

        evidence.push(
            'login-url'
        );

    } else if (
        loginInteractive.length > 0
    ) {

        state =
            'needs_login';

        confidence =
            0.9;

        evidence.push(
            'login-or-signup-control'
        );

    } else if (
        sessionProbe.unauthenticated
    ) {

        state =
            'needs_login';

        confidence =
            0.8;

        evidence.push(
            'empty-session-probe'
        );

    }


    return {

        state,

        confidence,

        evidence,

        page: {

            url,

            title

        },

        signals: {

            challenge,

            profileEvidence,

            profileIndicatorCount:
                snapshot.profileIndicators
                    .length,

            loginControlCount:
                loginInteractive.length,

            sessionProbe

        },

        checkedAt:
            new Date()
                .toISOString()

    };

}

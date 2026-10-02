import {
    rm
} from 'node:fs/promises';


import {
    join
} from 'node:path';


import {
    launchHeadlessBrowser
} from './runtime.mjs';


import {
    validateChatGPTPage
} from './chatgpt-validator.mjs';


const PROFILE_ROOT =
    process.env
        .STAGEPILOT_BROWSER_PROFILE_ROOT;


const profileKey =
    `validator-selftest-${Date.now()}-${process.pid}`;


const profilePath =
    join(
        PROFILE_ROOT,
        profileKey
    );


let runtime =
    null;


try {

    runtime =
        await launchHeadlessBrowser({

            profileKey,

            metadata: {

                purpose:
                    'validator-selftest'

            }

        });


    const pages =
        await runtime
            .browser
            .pages();


    const page =
        pages[0]
        ??
        await runtime
            .browser
            .newPage();


    await page.setContent(`
        <!doctype html>
        <html>
        <head>
            <title>Authenticated Mock</title>
        </head>
        <body>
            <button
                data-testid="profile-button"
                aria-label="Account"
            >
                Profile
            </button>
        </body>
        </html>
    `);


    const authenticated =
        await validateChatGPTPage(
            page
        );


    if (
        authenticated.state
        !==
        'authenticated'
    ) {

        throw new Error(
            `AUTH_MOCK_FAILED:${authenticated.state}`
        );

    }


    await page.setContent(`
        <!doctype html>
        <html>
        <head>
            <title>Guest Mock</title>
        </head>
        <body>
            <a href="/auth/login">
                Log in
            </a>

            <button>
                Sign up
            </button>

            <textarea
                placeholder="Message ChatGPT"
            ></textarea>
        </body>
        </html>
    `);


    const needsLogin =
        await validateChatGPTPage(
            page
        );


    if (
        needsLogin.state
        !==
        'needs_login'
    ) {

        throw new Error(
            `LOGIN_MOCK_FAILED:${needsLogin.state}`
        );

    }


    await page.setContent(`
        <!doctype html>
        <html>
        <head>
            <title>Just a moment...</title>
        </head>
        <body>
            Checking your browser before accessing ChatGPT
        </body>
        </html>
    `);


    const challenge =
        await validateChatGPTPage(
            page
        );


    if (
        challenge.state
        !==
        'challenge'
    ) {

        throw new Error(
            `CHALLENGE_MOCK_FAILED:${challenge.state}`
        );

    }


    console.log(
        JSON.stringify(
            {
                ok:
                    true,

                authenticated:
                    authenticated.state,

                guestWithComposer:
                    needsLogin.state,

                challenge:
                    challenge.state,

                composerIgnoredAsAuthSignal:
                    true
            },
            null,
            2
        )
    );

} finally {

    if (runtime) {

        await runtime.close()
            .catch(
                () => {}
            );

    }


    await rm(
        profilePath,
        {
            recursive:
                true,

            force:
                true
        }
    );

}

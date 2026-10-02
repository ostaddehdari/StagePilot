import {
    rm
} from 'node:fs/promises';


import {
    join
} from 'node:path';


import {
    launchHeadlessBrowser
} from './runtime.mjs';


const profileRoot =
    process.env
        .STAGEPILOT_BROWSER_PROFILE_ROOT;


if (!profileRoot) {

    throw new Error(
        'PROFILE_ROOT_MISSING'
    );

}


const profileKey =
    `smoke-${Date.now()}-${process.pid}`;


const profilePath =
    join(
        profileRoot,
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
                    's03-w02-smoke'

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


    await page.goto(
        'data:text/html,<html><head><title>StagePilot Browser Smoke</title></head><body><h1 id="stagepilot">StagePilot Browser Runtime</h1></body></html>',
        {
            waitUntil:
                'domcontentloaded',

            timeout:
                10000
        }
    );


    const title =
        await page.title();


    const heading =
        await page.$eval(
            '#stagepilot',
            element =>
                element.textContent
        );


    const version =
        await runtime
            .browser
            .version();


    const userAgent =
        await page.evaluate(
            () =>
                navigator.userAgent
        );


    if (
        title
        !==
        'StagePilot Browser Smoke'
    ) {

        throw new Error(
            'SMOKE_TITLE_MISMATCH'
        );

    }


    if (
        heading
        !==
        'StagePilot Browser Runtime'
    ) {

        throw new Error(
            'SMOKE_HEADING_MISMATCH'
        );

    }


    if (
        !version.includes(
            '153.'
        )
    ) {

        throw new Error(
            `UNEXPECTED_BROWSER_VERSION:${version}`
        );

    }


    const pid =
        runtime
            .browser
            .process()
            ?.pid
        ??
        null;


    console.log(
        JSON.stringify(
            {
                ok:
                    true,

                title,

                heading,

                version,

                pid,

                userAgent,

                profileKey,

                lockPath:
                    runtime.lockPath,

                sandboxMode:
                    'normal',

                noSandboxFlag:
                    false
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

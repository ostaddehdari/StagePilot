import puppeteer from 'puppeteer-core';


import {
    mkdir
} from 'node:fs/promises';


import {
    join
} from 'node:path';


import {
    acquireProfileLock
} from './profile-lock.mjs';


const EXECUTABLE =
    process.env
        .STAGEPILOT_BROWSER_EXECUTABLE
    ??
    '/usr/bin/google-chrome-stable';


const PROFILE_ROOT =
    process.env
        .STAGEPILOT_BROWSER_PROFILE_ROOT
    ??
    '/opt/stagepilot/storage/browser-profiles';


function validateProfileKey(
    profileKey
) {

    if (
        typeof profileKey !== 'string'
        ||
        !/^[a-zA-Z0-9][a-zA-Z0-9._-]{2,120}$/
            .test(
                profileKey
            )
    ) {

        throw new Error(
            'INVALID_PROFILE_KEY'
        );

    }

}


export async function launchHeadlessBrowser({

    profileKey,

    metadata = {}

}) {

    validateProfileKey(
        profileKey
    );


    const userDataDir =
        join(
            PROFILE_ROOT,
            profileKey
        );


    await mkdir(
        userDataDir,
        {
            recursive:
                true,

            mode:
                0o700
        }
    );


    const lock =
        await acquireProfileLock(
            profileKey,
            metadata
        );


    let browser =
        null;


    let released =
        false;


    const releaseLock =
        async () => {

            if (released) {

                return;

            }


            released =
                true;


            await lock.release()
                .catch(
                    () => {}
                );

        };


    try {

        browser =
            await puppeteer.launch({

                executablePath:
                    EXECUTABLE,

                headless:
                    true,

                userDataDir,

                pipe:
                    true,

                dumpio:
                    false,

                args: [

                    '--password-store=basic',

                    '--disable-dev-shm-usage',

                    '--no-first-run',

                    '--no-default-browser-check',

                    '--disable-background-networking',

                    '--disable-component-update',

                    '--disable-features=Translate',

                    '--disable-sync'

                ]

            });


        browser.once(
            'disconnected',
            () => {

                void releaseLock();

            }
        );


        return {

            browser,

            profileKey,

            userDataDir,

            lockPath:
                lock.lockPath,

            async close() {

                if (
                    browser
                    &&
                    browser.connected
                ) {

                    await browser.close();

                }


                await releaseLock();

            }

        };

    } catch (error) {

        await releaseLock();


        throw error;

    }

}

import puppeteer
from 'puppeteer-core';


import {
    constants
} from 'node:fs';


import {
    access,
    mkdir,
    rm,
    writeFile
} from 'node:fs/promises';


import {
    spawn
} from 'node:child_process';


import {
    join
} from 'node:path';


import {
    setTimeout as sleep
} from 'node:timers/promises';


import {
    acquireProfileLock
} from './profile-lock.mjs';


import {
    validateChatGPTPage
} from './chatgpt-validator.mjs';


import {
    startChatGPTAdapter
} from './chatgpt-adapter.mjs';


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


const SESSION_ROOT =
    process.env
        .STAGEPILOT_BROWSER_SESSION_ROOT
    ??
    '/opt/stagepilot/runtime/browser-sessions';


const TEMP_ROOT =
    process.env
        .STAGEPILOT_BROWSER_TEMP_ROOT
    ??
    '/opt/stagepilot/runtime/browser-tmp';


const PASSWORD_STORE =
    process.env
        .STAGEPILOT_BROWSER_PASSWORD_STORE
    ??
    'basic';


function envInt(
    name,
    fallback
) {

    const value =
        Number(
            process.env[name]
            ??
            fallback
        );


    if (
        !Number.isInteger(
            value
        )
    ) {

        throw new Error(
            `INVALID_ENV_INTEGER:${name}`
        );

    }


    return value;

}


const DISPLAY_MIN =
    envInt(
        'STAGEPILOT_BACKGROUND_DISPLAY_MIN',
        150
    );


const DISPLAY_MAX =
    envInt(
        'STAGEPILOT_BACKGROUND_DISPLAY_MAX',
        179
    );


const profileKey =
    process.argv[2];


const accountId =
    process.argv[3]
    ||
    null;


const targetUrl =
    process.argv[4]
    ||
    'https://chatgpt.com/';


if (
    !profileKey
    ||
    !/^[A-Za-z0-9][A-Za-z0-9._-]{2,120}$/
        .test(
            profileKey
        )
) {

    throw new Error(
        'INVALID_PROFILE_KEY'
    );

}


process.env.HOME =
    TEMP_ROOT;


const userDataDir =
    join(
        PROFILE_ROOT,
        profileKey
    );


/*
 * Compatibility state path.
 *
 * The StagePilot API already understands *.headless.json.
 * We retain that API contract while the actual browser is
 * Background Headful.
 */
const statePath =
    join(
        SESSION_ROOT,
        `${profileKey}.headless.json`
    );


const sessionDir =
    join(
        SESSION_ROOT,
        `${profileKey}.canonical-background-${Date.now()}`
    );


const xdgRuntime =
    join(
        sessionDir,
        'xdg-runtime'
    );


let lock =
    null;


let browser =
    null;


let xvfb =
    null;


let adapter =
    null;


let shuttingDown =
    false;


async function exists(
    path
) {

    try {

        await access(
            path,
            constants.F_OK
        );

        return true;

    } catch {

        return false;

    }

}


async function commandOk(
    command,
    args,
    env
) {

    return new Promise(
        resolve => {

            const child =
                spawn(
                    command,
                    args,
                    {
                        env,

                        stdio: [
                            'ignore',
                            'ignore',
                            'ignore'
                        ]
                    }
                );


            child.once(
                'error',
                () => resolve(false)
            );


            child.once(
                'close',
                code => resolve(code === 0)
            );

        }
    );

}


async function findDisplay() {

    for (
        let number = DISPLAY_MIN;
        number <= DISPLAY_MAX;
        number += 1
    ) {

        const displayName =
            `:${number}`;


        if (
            await commandOk(
                'xdpyinfo',
                [
                    '-display',
                    displayName
                ],
                process.env
            )
        ) {

            continue;

        }


        if (
            await exists(
                `/tmp/.X11-unix/X${number}`
            )
        ) {

            continue;

        }


        if (
            await exists(
                `/tmp/.X${number}-lock`
            )
        ) {

            continue;

        }


        return number;

    }


    throw new Error(
        'NO_FREE_BACKGROUND_DISPLAY'
    );

}


async function waitForDisplay(
    displayName,
    env,
    timeoutMs = 10000
) {

    const deadline =
        Date.now()
        +
        timeoutMs;


    while (
        Date.now()
        <
        deadline
    ) {

        if (
            await commandOk(
                'xdpyinfo',
                [
                    '-display',
                    displayName
                ],
                env
            )
        ) {

            return;

        }


        await sleep(
            200
        );

    }


    throw new Error(
        `DISPLAY_NOT_READY:${displayName}`
    );

}


async function closeChild(
    child
) {

    if (!child) {
        return;
    }


    if (
        child.exitCode !== null
        ||
        child.signalCode !== null
    ) {
        return;
    }


    child.kill(
        'SIGTERM'
    );


    const deadline =
        Date.now()
        +
        5000;


    while (
        Date.now()
        <
        deadline
    ) {

        if (
            child.exitCode !== null
            ||
            child.signalCode !== null
        ) {
            return;
        }


        await sleep(
            100
        );

    }


    child.kill(
        'SIGKILL'
    );

}


async function shutdown(
    code = 0
) {

    if (shuttingDown) {
        return;
    }


    shuttingDown =
        true;


    await rm(
        statePath,
        {
            force:
                true
        }
    );


    if (adapter) {

        await adapter
            .close()
            .catch(
                error => {

                    console.error(
                        'Adapter close error:',
                        error
                    );

                }
            );

    }


    if (browser) {

        await browser
            .close()
            .catch(
                error => {

                    console.error(
                        'Background Chrome close error:',
                        error
                    );

                }
            );

    }


    await closeChild(
        xvfb
    );


    await rm(
        sessionDir,
        {
            recursive:
                true,

            force:
                true
        }
    );


    if (lock) {

        await lock
            .release()
            .catch(
                error => {

                    console.error(
                        'Profile Lock release error:',
                        error
                    );

                }
            );

    }


    process.exit(
        code
    );

}


for (
    const signal
    of [
        'SIGTERM',
        'SIGINT',
        'SIGHUP'
    ]
) {

    process.on(
        signal,
        () => {

            void shutdown(
                0
            );

        }
    );

}


process.on(
    'uncaughtException',
    error => {

        console.error(
            error
        );


        void shutdown(
            1
        );

    }
);


process.on(
    'unhandledRejection',
    error => {

        console.error(
            error
        );


        void shutdown(
            1
        );

    }
);


try {

    await mkdir(
        userDataDir,
        {
            recursive:
                true,

            mode:
                0o700
        }
    );


    await mkdir(
        sessionDir,
        {
            recursive:
                true,

            mode:
                0o700
        }
    );


    await mkdir(
        xdgRuntime,
        {
            recursive:
                true,

            mode:
                0o700
        }
    );


    lock =
        await acquireProfileLock(
            profileKey,
            {
                mode:
                    'background-headful',

                apiCompatibilityMode:
                    'headless',

                accountId,

                automation:
                    true,

                headless:
                    false
            }
        );


    const displayNumber =
        await findDisplay();


    const displayName =
        `:${displayNumber}`;


    const runtimeEnv = {

        ...process.env,

        DISPLAY:
            displayName,

        HOME:
            TEMP_ROOT,

        XDG_RUNTIME_DIR:
            xdgRuntime

    };


    xvfb =
        spawn(
            'Xvfb',
            [
                displayName,

                '-screen',
                '0',
                '1440x900x24',

                '-ac',

                '-nolisten',
                'tcp'
            ],
            {
                env:
                    runtimeEnv,

                stdio: [
                    'ignore',
                    'inherit',
                    'inherit'
                ]
            }
        );


    await sleep(
        300
    );


    if (
        xvfb.exitCode !== null
        ||
        xvfb.signalCode !== null
    ) {

        throw new Error(
            `BACKGROUND_XVFB_EXITED:${displayName}`
        );

    }


    await waitForDisplay(
        displayName,
        runtimeEnv
    );


    if (
        xvfb.exitCode !== null
        ||
        xvfb.signalCode !== null
    ) {

        throw new Error(
            `BACKGROUND_XVFB_NOT_OWNER:${displayName}`
        );

    }


    /*
     * Puppeteer controls Chrome, but Chrome is NOT headless.
     *
     * We intentionally do not use stealth plugins or modify
     * automation detection. Any real challenge remains visible
     * to the validator and is handled conservatively.
     */
    browser =
        await puppeteer.launch({

            executablePath:
                EXECUTABLE,

            headless:
                false,

            pipe:
                true,

            userDataDir,

            defaultViewport: {

                width:
                    1440,

                height:
                    900

            },

            env:
                runtimeEnv,

            args: [

                `--password-store=${PASSWORD_STORE}`,

                '--no-first-run',

                '--no-default-browser-check',

                '--window-size=1440,900'

            ]

        });


    const pages =
        await browser.pages();


    const page =
        pages[0]
        ??
        await browser.newPage();


    await page.goto(
        targetUrl,
        {
            waitUntil:
                'domcontentloaded',

            timeout:
                45000
        }
    );


    await sleep(
        2000
    );


    let validation =
        await validateChatGPTPage(
            page
        );


    const validationAttempts = [
        validation
    ];


    for (
        let attempt = 1;
        attempt < 10;
        attempt += 1
    ) {

        if (
            validation.state
            ===
            'authenticated'
        ) {

            break;

        }


        await sleep(
            3000
        );


        validation =
            await validateChatGPTPage(
                page
            );


        validationAttempts.push(
            validation
        );

    }


    validation = {

        ...validation,

        attempts:
            validationAttempts.map(
                item => ({

                    state:
                        item.state,

                    confidence:
                        item.confidence,

                    evidence:
                        item.evidence,

                    checkedAt:
                        item.checkedAt

                })
            )

    };


    const state = {

        status:
            'ready',

        /*
         * Keep "headless" for compatibility with the StagePilot
         * API/DB contract already built in W05.
         */
        mode:
            'headless',

        executionMode:
            'background-headful',

        controlMode:
            'puppeteer-background',

        automation:
            true,

        headless:
            false,

        profileKey,

        accountId,

        controllerPid:
            process.pid,

        browserPid:
            browser
                .process()
                ?.pid
            ??
            null,

        xvfbPid:
            xvfb.pid
            ??
            null,

        display:
            displayName,

        displayNumber,

        userDataDir,

        targetUrl,

        currentUrl:
            page.url(),

        authState:
            validation.state,

        validation,

        startedAt:
            new Date()
                .toISOString()

    };


    await writeFile(
        statePath,
        JSON.stringify(
            state,
            null,
            2
        ),
        {
            mode:
                0o600
        }
    );


    adapter =
        await startChatGPTAdapter({

            page,

            profileKey,

            accountId

        });


    console.log(
        JSON.stringify({

            ok:
                true,

            status:
                'ready',

            mode:
                'headless',

            executionMode:
                'background-headful',

            headless:
                false,

            profileKey,

            authState:
                validation.state

        })
    );


    await new Promise(
        () => {}
    );

} catch (error) {

    console.error(
        error
    );


    await shutdown(
        1
    );

}

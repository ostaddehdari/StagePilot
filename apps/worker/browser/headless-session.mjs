import {
    closeSync,
    openSync
} from 'node:fs';


import {
    readFile,
    rm
} from 'node:fs/promises';


import {
    dirname,
    join
} from 'node:path';


import {
    fileURLToPath
} from 'node:url';


import {
    spawn
} from 'node:child_process';


import {
    setTimeout as sleep
} from 'node:timers/promises';


const SESSION_ROOT =
    process.env
        .STAGEPILOT_BROWSER_SESSION_ROOT
    ??
    '/opt/stagepilot/runtime/browser-sessions';


const currentDir =
    dirname(
        fileURLToPath(
            import.meta.url
        )
    );


function validProfile(
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


function pidAlive(
    pid
) {

    try {

        process.kill(
            Number(pid),
            0
        );


        return true;

    } catch (error) {

        return (
            error?.code
            ===
            'EPERM'
        );

    }

}


async function readState(
    path
) {

    try {

        return JSON.parse(
            await readFile(
                path,
                'utf8'
            )
        );

    } catch {

        return null;

    }

}


async function start(
    profileKey,
    accountId,
    targetUrl
) {

    validProfile(
        profileKey
    );


    const statePath =
        join(
            SESSION_ROOT,
            `${profileKey}.headless.json`
        );


    const current =
        await readState(
            statePath
        );


    if (
        current
        &&
        pidAlive(
            current.controllerPid
        )
    ) {

        throw new Error(
            'HEADLESS_SESSION_ALREADY_RUNNING'
        );

    }


    if (current) {

        await rm(
            statePath,
            {
                force:
                    true
            }
        );

    }


    const controller =
        join(
            currentDir,
            'headless-controller.mjs'
        );


    const logPath =
        join(
            SESSION_ROOT,
            `${profileKey}.headless.log`
        );


    const logFd =
        openSync(
            logPath,
            'a',
            0o600
        );


    const child =
        spawn(
            process.execPath,
            [
                controller,
                profileKey,
                accountId
                ??
                '',
                targetUrl
                ??
                'https://chatgpt.com/'
            ],
            {
                detached:
                    true,

                env:
                    process.env,

                stdio: [
                    'ignore',
                    logFd,
                    logFd
                ]
            }
        );


    child.unref();


    closeSync(
        logFd
    );


    const deadline =
        Date.now()
        +
        45000;


    while (
        Date.now()
        <
        deadline
    ) {

        const state =
            await readState(
                statePath
            );


        if (
            state
            &&
            state.status
            ===
            'ready'
        ) {

            console.log(
                JSON.stringify(
                    state,
                    null,
                    2
                )
            );


            return;

        }


        if (
            !pidAlive(
                child.pid
            )
        ) {

            throw new Error(
                `HEADLESS_CONTROLLER_EXITED:${logPath}`
            );

        }


        await sleep(
            250
        );

    }


    throw new Error(
        `HEADLESS_START_TIMEOUT:${logPath}`
    );

}


async function stop(
    profileKey
) {

    validProfile(
        profileKey
    );


    const statePath =
        join(
            SESSION_ROOT,
            `${profileKey}.headless.json`
        );


    const state =
        await readState(
            statePath
        );


    if (!state) {

        console.log(
            JSON.stringify({

                ok:
                    true,

                status:
                    'stopped',

                alreadyStopped:
                    true,

                profileKey

            })
        );


        return;

    }


    const pid =
        Number(
            state.controllerPid
        );


    if (
        pidAlive(
            pid
        )
    ) {

        process.kill(
            pid,
            'SIGTERM'
        );

    }


    const deadline =
        Date.now()
        +
        15000;


    while (
        Date.now()
        <
        deadline
    ) {

        const current =
            await readState(
                statePath
            );


        if (
            !current
            &&
            !pidAlive(
                pid
            )
        ) {

            console.log(
                JSON.stringify({

                    ok:
                        true,

                    status:
                        'stopped',

                    profileKey

                })
            );


            return;

        }


        await sleep(
            250
        );

    }


    if (
        pidAlive(
            pid
        )
    ) {

        try {

            process.kill(
                -pid,
                'SIGKILL'
            );

        } catch {

            try {

                process.kill(
                    pid,
                    'SIGKILL'
                );

            } catch {}

        }

    }


    await rm(
        statePath,
        {
            force:
                true
        }
    );


    console.log(
        JSON.stringify({

            ok:
                true,

            status:
                'forced-stop',

            profileKey

        })
    );

}


async function status(
    profileKey
) {

    validProfile(
        profileKey
    );


    const statePath =
        join(
            SESSION_ROOT,
            `${profileKey}.headless.json`
        );


    const state =
        await readState(
            statePath
        );


    if (!state) {

        console.log(
            JSON.stringify({

                status:
                    'stopped',

                profileKey

            })
        );


        return;

    }


    const alive =
        pidAlive(
            state.controllerPid
        );


    console.log(
        JSON.stringify(
            {

                ...state,

                controllerAlive:
                    alive,

                status:
                    alive
                    ? state.status
                    : 'stale'

            },
            null,
            2
        )
    );

}


const command =
    process.argv[2];


const profileKey =
    process.argv[3];


if (!command) {

    throw new Error(
        'COMMAND_REQUIRED'
    );

}


if (!profileKey) {

    throw new Error(
        'PROFILE_KEY_REQUIRED'
    );

}


switch (command) {

    case 'start':

        await start(
            profileKey,
            process.argv[4]
            ||
            null,
            process.argv[5]
            ||
            'https://chatgpt.com/'
        );

        break;


    case 'stop':

        await stop(
            profileKey
        );

        break;


    case 'status':

        await status(
            profileKey
        );

        break;


    default:

        throw new Error(
            `UNKNOWN_COMMAND:${command}`
        );

}

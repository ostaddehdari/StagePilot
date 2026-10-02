import {
    closeSync,
    openSync
} from 'node:fs';


import {
    readFile,
    rm,
    writeFile
} from 'node:fs/promises';


import {
    spawn
} from 'node:child_process';


import {
    dirname,
    join
} from 'node:path';


import {
    fileURLToPath
} from 'node:url';


import {
    setTimeout as sleep
} from 'node:timers/promises';


const SESSION_ROOT =
    process.env
        .STAGEPILOT_BROWSER_SESSION_ROOT
    ??
    '/opt/stagepilot/runtime/browser-sessions';


const HERE =
    dirname(
        fileURLToPath(
            import.meta.url
        )
    );


const CONTROLLER =
    join(
        HERE,
        'background-headful-controller.mjs'
    );


async function readJson(
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


function pidAlive(
    pid
) {

    if (
        !Number.isInteger(
            pid
        )
        ||
        pid <= 1
    ) {

        return false;

    }


    try {

        process.kill(
            pid,
            0
        );


        return true;

    } catch {

        return false;

    }

}


async function controllerMatches(
    pid,
    profileKey
) {

    if (
        !pidAlive(
            pid
        )
    ) {

        return false;

    }


    try {

        const raw =
            await readFile(
                `/proc/${pid}/cmdline`
            );


        const command =
            raw
                .toString()
                .replace(
                    /\0/g,
                    ' '
                );


        return (
            command.includes(
                'background-headful-controller.mjs'
            )
            &&
            command.includes(
                profileKey
            )
        );

    } catch {

        return false;

    }

}


function paths(
    profileKey
) {

    return {

        state:
            join(
                SESSION_ROOT,
                `${profileKey}.background-headful.json`
            ),

        pid:
            join(
                SESSION_ROOT,
                `${profileKey}.background-headful.pid`
            ),

        log:
            join(
                SESSION_ROOT,
                `${profileKey}.background-headful.controller.log`
            )

    };

}


async function status(
    profileKey
) {

    const p =
        paths(
            profileKey
        );


    const state =
        await readJson(
            p.state
        );


    let pid =
        Number(
            state?.controllerPid
            ??
            0
        );


    if (!pid) {

        try {

            pid =
                Number(
                    (
                        await readFile(
                            p.pid,
                            'utf8'
                        )
                    ).trim()
                );

        } catch {}

    }


    if (
        pid
        &&
        await controllerMatches(
            pid,
            profileKey
        )
    ) {

        return {

            ok:
                true,

            status:
                state?.status
                ??
                'starting',

            running:
                true,

            profileKey,

            controllerPid:
                pid,

            runtime:
                state,

            logPath:
                p.log

        };

    }


    return {

        ok:
            true,

        status:
            'stopped',

        running:
            false,

        profileKey,

        runtime:
            null,

        logPath:
            p.log

    };

}


async function start(
    profileKey,
    accountId,
    targetUrl
) {

    const existing =
        await status(
            profileKey
        );


    if (
        existing.running
    ) {

        throw new Error(
            'BACKGROUND_HEADFUL_ALREADY_RUNNING'
        );

    }


    const p =
        paths(
            profileKey
        );


    await rm(
        p.state,
        {
            force:
                true
        }
    );


    await rm(
        p.pid,
        {
            force:
                true
        }
    );


    const logFd =
        openSync(
            p.log,
            'a',
            0o600
        );


    const child =
        spawn(
            process.execPath,
            [
                CONTROLLER,
                profileKey,
                accountId
                ??
                '',
                targetUrl
                ??
                'https://chatgpt.com/'
            ],
            {
                env:
                    process.env,

                detached:
                    true,

                stdio: [
                    'ignore',
                    logFd,
                    logFd
                ]
            }
        );


    const pid =
        child.pid;


    child.unref();


    closeSync(
        logFd
    );


    await writeFile(
        p.pid,
        `${pid}\n`,
        {
            mode:
                0o600
        }
    );


    const deadline =
        Date.now()
        +
        90000;


    while (
        Date.now()
        <
        deadline
    ) {

        const state =
            await readJson(
                p.state
            );


        if (
            state?.status
            ===
            'ready'
        ) {

            return {

                ok:
                    true,

                ...state,

                logPath:
                    p.log

            };

        }


        if (
            !await controllerMatches(
                pid,
                profileKey
            )
        ) {

            let tail =
                '';


            try {

                const log =
                    await readFile(
                        p.log,
                        'utf8'
                    );


                tail =
                    log.slice(
                        -12000
                    );

            } catch {}


            throw new Error(
                `BACKGROUND_HEADFUL_CONTROLLER_EXITED\n${tail}`
            );

        }


        await sleep(
            500
        );

    }


    throw new Error(
        'BACKGROUND_HEADFUL_START_TIMEOUT'
    );

}


async function stop(
    profileKey
) {

    const p =
        paths(
            profileKey
        );


    const current =
        await status(
            profileKey
        );


    if (
        !current.running
    ) {

        await rm(
            p.state,
            {
                force:
                    true
            }
        );


        await rm(
            p.pid,
            {
                force:
                    true
            }
        );


        return {

            ok:
                true,

            status:
                'stopped',

            alreadyStopped:
                true,

            profileKey

        };

    }


    const pid =
        Number(
            current.controllerPid
        );


    if (
        !await controllerMatches(
            pid,
            profileKey
        )
    ) {

        throw new Error(
            'BACKGROUND_CONTROLLER_PID_OWNERSHIP_MISMATCH'
        );

    }


    process.kill(
        pid,
        'SIGTERM'
    );


    const deadline =
        Date.now()
        +
        15000;


    while (
        Date.now()
        <
        deadline
    ) {

        if (
            !pidAlive(
                pid
            )
        ) {

            break;

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

        if (
            !await controllerMatches(
                pid,
                profileKey
            )
        ) {

            throw new Error(
                'BACKGROUND_CONTROLLER_PID_CHANGED'
            );

        }


        process.kill(
            pid,
            'SIGKILL'
        );


        await sleep(
            500
        );

    }


    await rm(
        p.state,
        {
            force:
                true
        }
    );


    await rm(
        p.pid,
        {
            force:
                true
        }
    );


    return {

        ok:
            true,

        status:
            'stopped',

        profileKey

    };

}


const command =
    process.argv[2];


const profileKey =
    process.argv[3];


if (
    !command
    ||
    !profileKey
) {

    throw new Error(
        'USAGE: start|status|stop PROFILE_KEY [ACCOUNT_ID] [TARGET_URL]'
    );

}


try {

    let result;


    if (
        command
        ===
        'start'
    ) {

        result =
            await start(
                profileKey,
                process.argv[4]
                ||
                null,
                process.argv[5]
                ||
                'https://chatgpt.com/'
            );

    } else if (
        command
        ===
        'status'
    ) {

        result =
            await status(
                profileKey
            );

    } else if (
        command
        ===
        'stop'
    ) {

        result =
            await stop(
                profileKey
            );

    } else {

        throw new Error(
            'UNKNOWN_COMMAND'
        );

    }


    console.log(
        JSON.stringify(
            result,
            null,
            2
        )
    );

} catch (error) {

    console.error(
        error?.stack
        ??
        error
    );


    process.exit(
        1
    );

}

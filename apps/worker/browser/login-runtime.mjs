import {
    constants,
    closeSync,
    openSync
} from 'node:fs';


import {
    access,
    mkdir,
    rm,
    writeFile
} from 'node:fs/promises';


import {
    join
} from 'node:path';


import {
    spawn
} from 'node:child_process';


import {
    connect,
    createServer
} from 'node:net';


import {
    setTimeout as sleep
} from 'node:timers/promises';


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


const NOVNC_WEB_ROOT =
    process.env
        .STAGEPILOT_NOVNC_WEB_ROOT
    ??
    '/usr/share/novnc';


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


    if (!Number.isInteger(value)) {

        throw new Error(
            `INVALID_ENV_INTEGER:${name}`
        );

    }


    return value;

}


const DISPLAY_MIN =
    envInt(
        'STAGEPILOT_LOGIN_DISPLAY_MIN',
        120
    );


const DISPLAY_MAX =
    envInt(
        'STAGEPILOT_LOGIN_DISPLAY_MAX',
        149
    );


const VNC_MIN =
    envInt(
        'STAGEPILOT_LOGIN_VNC_PORT_MIN',
        15900
    );


const VNC_MAX =
    envInt(
        'STAGEPILOT_LOGIN_VNC_PORT_MAX',
        15929
    );


const NOVNC_MIN =
    envInt(
        'STAGEPILOT_LOGIN_NOVNC_PORT_MIN',
        16080
    );


const NOVNC_MAX =
    envInt(
        'STAGEPILOT_LOGIN_NOVNC_PORT_MAX',
        16109
    );


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


async function findDisplay() {

    for (
        let number = DISPLAY_MIN;
        number <= DISPLAY_MAX;
        number += 1
    ) {

        const displayName =
            `:${number}`;


        const socketPath =
            `/tmp/.X11-unix/X${number}`;


        const lockPath =
            `/tmp/.X${number}-lock`;


        /*
         * A display is considered occupied when ANY of these
         * are true:
         *
         *   - xdpyinfo can reach an X server
         *   - a filesystem X socket exists
         *   - an X lock file exists
         *
         * This avoids reusing an X display that is active
         * through an abstract Unix socket even when the
         * filesystem socket is not visible.
         */

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
                socketPath
            )
        ) {

            continue;

        }


        if (
            await exists(
                lockPath
            )
        ) {

            continue;

        }


        return number;

    }


    throw new Error(
        'NO_FREE_X_DISPLAY'
    );

}


async function portFree(
    port
) {

    return new Promise(
        resolve => {

            const server =
                createServer();


            server.unref();


            server.once(
                'error',
                () =>
                    resolve(
                        false
                    )
            );


            server.listen(
                {
                    host:
                        '127.0.0.1',

                    port,

                    exclusive:
                        true
                },
                () => {

                    server.close(
                        () =>
                            resolve(
                                true
                            )
                    );

                }
            );

        }
    );

}


async function findPort(
    min,
    max
) {

    for (
        let port = min;
        port <= max;
        port += 1
    ) {

        if (
            await portFree(
                port
            )
        ) {

            return port;

        }

    }


    throw new Error(
        `NO_FREE_PORT:${min}-${max}`
    );

}


async function canConnect(
    port
) {

    return new Promise(
        resolve => {

            const socket =
                connect({
                    host:
                        '127.0.0.1',

                    port
                });


            let finished =
                false;


            const finish =
                result => {

                    if (finished) {

                        return;

                    }


                    finished =
                        true;


                    socket.destroy();


                    resolve(
                        result
                    );

                };


            socket.setTimeout(
                500
            );


            socket.once(
                'connect',
                () =>
                    finish(
                        true
                    )
            );


            socket.once(
                'timeout',
                () =>
                    finish(
                        false
                    )
            );


            socket.once(
                'error',
                () =>
                    finish(
                        false
                    )
            );

        }
    );

}


async function waitForPort(
    port,
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
            await canConnect(
                port
            )
        ) {

            return;

        }


        await sleep(
            200
        );

    }


    throw new Error(
        `PORT_NOT_READY:${port}`
    );

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
                () =>
                    resolve(
                        false
                    )
            );


            child.once(
                'close',
                code =>
                    resolve(
                        code === 0
                    )
            );

        }
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


function spawnLogged(
    command,
    args,
    env,
    logFd
) {

    return spawn(
        command,
        args,
        {
            env,

            stdio: [
                'ignore',
                logFd,
                logFd
            ]
        }
    );

}


async function ensureChromeRunning(
    chrome
) {

    await sleep(
        1500
    );


    if (
        chrome.exitCode !== null
        ||
        chrome.signalCode !== null
    ) {

        throw new Error(
            `VISIBLE_CHROME_EXITED:${chrome.exitCode}:${chrome.signalCode}`
        );

    }

}


export async function launchVisibleLoginRuntime({

    profileKey,

    accountId = null,

    targetUrl =
        'https://chatgpt.com/'

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
            {
                mode:
                    'human-visible-login',

                accountId,

                automation:
                    false
            }
        );


    const sessionDir =
        join(
            SESSION_ROOT,
            `${profileKey}-${Date.now()}`
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


    const xdgRuntime =
        join(
            sessionDir,
            'xdg-runtime'
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


    const statePath =
        join(
            SESSION_ROOT,
            `${profileKey}.json`
        );


    const logPath =
        join(
            sessionDir,
            'runtime.log'
        );


    const logFd =
        openSync(
            logPath,
            'a',
            0o600
        );


    let xvfb =
        null;

    let openbox =
        null;

    let chrome =
        null;

    let x11vnc =
        null;

    let websockify =
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

        const displayNumber =
            await findDisplay();


        const vncPort =
            await findPort(
                VNC_MIN,
                VNC_MAX
            );


        const noVncPort =
            await findPort(
                NOVNC_MIN,
                NOVNC_MAX
            );


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
            spawnLogged(
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
                runtimeEnv,
                logFd
            );


        await sleep(
            250
        );


        if (
            xvfb.exitCode !== null
            ||
            xvfb.signalCode !== null
        ) {

            throw new Error(
                `XVFB_EXITED_BEFORE_READY:${displayName}:code=${xvfb.exitCode}:signal=${xvfb.signalCode}`
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
                `XVFB_NOT_OWNER_OF_DISPLAY:${displayName}`
            );

        }


        openbox =
            spawnLogged(
                'openbox',
                [],
                runtimeEnv,
                logFd
            );


        await sleep(
            500
        );


        /*
         * IMPORTANT:
         *
         * This Chrome is intentionally NOT launched with Puppeteer.
         *
         * There is:
         *   - no --remote-debugging-port
         *   - no --remote-debugging-pipe
         *   - no --enable-automation
         *   - no Puppeteer connection
         *
         * It is a normal Chrome controlled only by the human
         * through noVNC during authentication.
         */

        chrome =
            spawnLogged(
                EXECUTABLE,
                [
                    `--user-data-dir=${userDataDir}`,

                    '--password-store=basic',

                    '--no-first-run',

                    '--no-default-browser-check',

                    '--start-maximized',

                    targetUrl
                ],
                runtimeEnv,
                logFd
            );


        await ensureChromeRunning(
            chrome
        );


        x11vnc =
            spawnLogged(
                'x11vnc',
                [
                    '-display',
                    displayName,

                    '-forever',

                    '-shared',

                    '-localhost',

                    '-rfbport',
                    String(
                        vncPort
                    ),

                    '-noxdamage',

                    '-nopw'
                ],
                runtimeEnv,
                logFd
            );


        await waitForPort(
            vncPort
        );


        websockify =
            spawnLogged(
                'websockify',
                [
                    `--web=${NOVNC_WEB_ROOT}`,

                    `127.0.0.1:${noVncPort}`,

                    `127.0.0.1:${vncPort}`
                ],
                runtimeEnv,
                logFd
            );


        await waitForPort(
            noVncPort
        );


        const state = {

            status:
                'ready',

            mode:
                'visible-login',

            controlMode:
                'human',

            automation:
                false,

            profileKey,

            accountId,

            controllerPid:
                process.pid,

            display:
                displayName,

            displayNumber,

            vncPort,

            noVncPort,

            userDataDir,

            sessionDir,

            logPath,

            browserPid:
                chrome.pid
                ??
                null,

            xvfbPid:
                xvfb.pid
                ??
                null,

            openboxPid:
                openbox.pid
                ??
                null,

            x11vncPid:
                x11vnc.pid
                ??
                null,

            websockifyPid:
                websockify.pid
                ??
                null,

            localNoVncUrl:
                `http://127.0.0.1:${noVncPort}/vnc.html?host=127.0.0.1&port=${noVncPort}&autoconnect=1&resize=scale`,

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


        return {

            ...state,

            statePath,

            async close() {

                await rm(
                    statePath,
                    {
                        force:
                            true
                    }
                );


                await closeChild(
                    websockify
                );


                await closeChild(
                    x11vnc
                );


                await closeChild(
                    chrome
                );


                await closeChild(
                    openbox
                );


                await closeChild(
                    xvfb
                );


                try {

                    closeSync(
                        logFd
                    );

                } catch {}


                await rm(
                    sessionDir,
                    {
                        recursive:
                            true,

                        force:
                            true
                    }
                );


                await releaseLock();

            }

        };

    } catch (error) {

        await rm(
            statePath,
            {
                force:
                    true
            }
        );


        await closeChild(
            websockify
        );


        await closeChild(
            x11vnc
        );


        await closeChild(
            chrome
        );


        await closeChild(
            openbox
        );


        await closeChild(
            xvfb
        );


        try {

            closeSync(
                logFd
            );

        } catch {}


        await rm(
            sessionDir,
            {
                recursive:
                    true,

                force:
                    true
            }
        );


        await releaseLock();


        throw error;

    }

}

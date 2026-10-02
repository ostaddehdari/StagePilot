import {
    constants
} from 'node:fs';


import {
    mkdir,
    open,
    readFile,
    unlink
} from 'node:fs/promises';


import {
    hostname
} from 'node:os';


import {
    join
} from 'node:path';


import {
    randomUUID
} from 'node:crypto';


const LOCK_ROOT =
    process.env
        .STAGEPILOT_BROWSER_LOCK_ROOT
    ??
    '/opt/stagepilot/runtime/browser-locks';


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


function pidAlive(
    pid
) {

    if (
        !Number.isInteger(pid)
        ||
        pid <= 0
    ) {

        return false;

    }


    try {

        process.kill(
            pid,
            0
        );


        return true;

    } catch (error) {

        if (
            error?.code === 'EPERM'
        ) {

            return true;

        }


        return false;

    }

}


async function readLock(
    path
) {

    try {

        const raw =
            await readFile(
                path,
                'utf8'
            );


        return JSON.parse(
            raw
        );

    } catch {

        return null;

    }

}


export async function acquireProfileLock(
    profileKey,
    metadata = {}
) {

    validateProfileKey(
        profileKey
    );


    await mkdir(
        LOCK_ROOT,
        {
            recursive:
                true,

            mode:
                0o700
        }
    );


    const lockPath =
        join(
            LOCK_ROOT,
            `${profileKey}.lock`
        );


    const token =
        randomUUID();


    const payload = {

        token,

        profileKey,

        pid:
            process.pid,

        hostname:
            hostname(),

        acquiredAt:
            new Date()
                .toISOString(),

        metadata

    };


    for (
        let attempt = 0;
        attempt < 2;
        attempt += 1
    ) {

        try {

            const handle =
                await open(
                    lockPath,
                    constants.O_CREAT
                    |
                    constants.O_EXCL
                    |
                    constants.O_WRONLY,
                    0o600
                );


            try {

                await handle.writeFile(
                    JSON.stringify(
                        payload,
                        null,
                        2
                    )
                );

            } finally {

                await handle.close();

            }


            let released =
                false;


            return {

                lockPath,

                token,

                payload,

                async release() {

                    if (released) {

                        return;

                    }


                    const current =
                        await readLock(
                            lockPath
                        );


                    if (
                        current?.token
                        !==
                        token
                    ) {

                        throw new Error(
                            'PROFILE_LOCK_TOKEN_MISMATCH'
                        );

                    }


                    await unlink(
                        lockPath
                    );


                    released =
                        true;

                }

            };

        } catch (error) {

            if (
                error?.code
                !==
                'EEXIST'
            ) {

                throw error;

            }


            const existing =
                await readLock(
                    lockPath
                );


            const sameHost =
                existing?.hostname
                ===
                hostname();


            const active =
                sameHost
                &&
                pidAlive(
                    Number(
                        existing?.pid
                    )
                );


            if (active) {

                const lockError =
                    new Error(
                        'PROFILE_LOCKED'
                    );


                lockError.details =
                    existing;


                throw lockError;

            }


            if (
                attempt === 0
            ) {

                await unlink(
                    lockPath
                ).catch(
                    () => {}
                );


                continue;

            }


            throw new Error(
                'PROFILE_LOCK_RECOVERY_FAILED'
            );

        }

    }


    throw new Error(
        'PROFILE_LOCK_FAILED'
    );

}

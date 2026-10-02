import {
    writeFile,
    access
} from 'node:fs/promises';


import {
    join
} from 'node:path';


import {
    hostname
} from 'node:os';


import {
    acquireProfileLock
} from './profile-lock.mjs';


const lockRoot =
    process.env
        .STAGEPILOT_BROWSER_LOCK_ROOT;


if (!lockRoot) {

    throw new Error(
        'LOCK_ROOT_MISSING'
    );

}


const profileKey =
    `lock-selftest-${process.pid}`;


const lockPath =
    join(
        lockRoot,
        `${profileKey}.lock`
    );


const first =
    await acquireProfileLock(
        profileKey,
        {
            test:
                'first'
        }
    );


let duplicateBlocked =
    false;


try {

    await acquireProfileLock(
        profileKey,
        {
            test:
                'duplicate'
        }
    );

} catch (error) {

    if (
        error?.message
        ===
        'PROFILE_LOCKED'
    ) {

        duplicateBlocked =
            true;

    } else {

        throw error;

    }

}


if (!duplicateBlocked) {

    throw new Error(
        'DUPLICATE_LOCK_NOT_BLOCKED'
    );

}


await first.release();


await writeFile(
    lockPath,
    JSON.stringify({

        token:
            'stale-selftest',

        profileKey,

        pid:
            99999999,

        hostname:
            hostname(),

        acquiredAt:
            '2000-01-01T00:00:00.000Z'

    }),
    {
        mode:
            0o600
    }
);


const recovered =
    await acquireProfileLock(
        profileKey,
        {
            test:
                'stale-recovery'
        }
    );


await recovered.release();


let remains =
    false;


try {

    await access(
        lockPath
    );


    remains =
        true;

} catch {

    remains =
        false;

}


if (remains) {

    throw new Error(
        'LOCK_FILE_REMAINS'
    );

}


console.log(
    JSON.stringify(
        {
            ok:
                true,

            duplicateBlocked,

            staleRecovered:
                true,

            profileKey
        }
    )
);

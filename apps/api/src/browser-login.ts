import {
    createHmac
} from 'node:crypto';


import {
    execFile
} from 'node:child_process';


import {
    promisify
} from 'node:util';


import {
    readFile
} from 'node:fs/promises';


import {
    join
} from 'node:path';


import {
    getDatabasePool
} from './db';


const execFileAsync =
    promisify(
        execFile
    );


const LOGIN_MANAGER =
    '/opt/stagepilot/apps/worker/browser/login-session.mjs';


const SESSION_ROOT =
    process.env.STAGEPILOT_BROWSER_SESSION_ROOT
    ??
    '/opt/stagepilot/runtime/browser-sessions';


const SECRET =
    process.env.STAGEPILOT_NOVNC_GATEWAY_SECRET
    ??
    '';


const TOKEN_TTL =
    Number(
        process.env.STAGEPILOT_NOVNC_TOKEN_TTL
        ??
        300
    );


function pidAlive(
    pid: unknown
) {

    try {

        process.kill(
            Number(pid),
            0
        );


        return true;

    } catch (error) {

        return (
            (
                error as NodeJS.ErrnoException
            )?.code
            ===
            'EPERM'
        );

    }

}


async function account(
    accountId: string
) {

    const db =
        getDatabasePool();


    const result =
        await db.query(
            `
                SELECT
                    id,
                    label,
                    profile_key,
                    status
                FROM chat_accounts
                WHERE id=$1::uuid
            `,
            [
                accountId
            ]
        );


    if (
        result.rowCount !== 1
    ) {

        throw new Error(
            'CHAT_ACCOUNT_NOT_FOUND'
        );

    }


    return result.rows[0];

}


async function readRuntimeState(
    profileKey: string
) {

    const statePath =
        join(
            SESSION_ROOT,
            `${profileKey}.json`
        );


    try {

        const state =
            JSON.parse(
                await readFile(
                    statePath,
                    'utf8'
                )
            );


        return state;

    } catch {

        return null;

    }

}


function viewerToken(
    accountId: string,
    profileKey: string,
    noVncPort: number
) {

    if (
        SECRET.length < 64
    ) {

        throw new Error(
            'NOVNC_GATEWAY_NOT_CONFIGURED'
        );

    }


    const exp =
        Math.floor(
            Date.now()
            /
            1000
        )
        +
        TOKEN_TTL;


    const payload = {

        v:
            1,

        accountId,

        profileKey,

        noVncPort,

        exp

    };


    const body =
        Buffer.from(
            JSON.stringify(
                payload
            )
        ).toString(
            'base64url'
        );


    const signature =
        createHmac(
            'sha256',
            SECRET
        )
            .update(
                body
            )
            .digest(
                'base64url'
            );


    return {
        token:
            `${body}.${signature}`,

        exp
    };

}


function runtimeResponse(
    accountRow: Record<string, unknown>,
    state: Record<string, unknown> | null
) {

    const alive =
        state
        &&
        state.status === 'ready'
        &&
        pidAlive(
            state.controllerPid
        );


    if (!alive) {

        return {

            status:
                state
                ? 'stale'
                : 'stopped',

            accountId:
                accountRow.id,

            profileKey:
                accountRow.profile_key,

            viewerUrl:
                null,

            runtime:
                state

        };

    }


    const noVncPort =
        Number(
            state.noVncPort
        );


    const signed =
        viewerToken(
            String(
                accountRow.id
            ),
            String(
                accountRow.profile_key
            ),
            noVncPort
        );


    return {

        status:
            'ready',

        accountId:
            accountRow.id,

        profileKey:
            accountRow.profile_key,

        viewerUrl:
            `/StagePilot/novnc-gateway/view?token=${encodeURIComponent(signed.token)}`,

        viewerExpiresAt:
            new Date(
                signed.exp
                *
                1000
            ).toISOString(),

        runtime:
            state

    };

}


async function manager(
    args: string[]
) {

    const result =
        await execFileAsync(
            process.execPath,
            [
                LOGIN_MANAGER,
                ...args
            ],
            {
                env:
                    process.env,

                cwd:
                    '/opt/stagepilot/apps/worker',

                timeout:
                    45000,

                maxBuffer:
                    1024
                    *
                    1024
            }
        );


    const text =
        result.stdout.trim();


    return text
        ? JSON.parse(
            text
        )
        : null;

}


export async function getAccountBrowserLogin(
    accountId: string
) {

    const row =
        await account(
            accountId
        );


    const state =
        await readRuntimeState(
            String(
                row.profile_key
            )
        );


    return runtimeResponse(
        row,
        state
    );

}


export async function startAccountBrowserLogin(
    accountId: string,
    targetUrl?: unknown
) {

    const row =
        await account(
            accountId
        );


    const profileKey =
        String(
            row.profile_key
        );


    const existing =
        await readRuntimeState(
            profileKey
        );


    if (
        existing
        &&
        existing.status === 'ready'
        &&
        pidAlive(
            existing.controllerPid
        )
    ) {

        return runtimeResponse(
            row,
            existing
        );

    }


    let target =
        'https://chatgpt.com/';


    if (
        typeof targetUrl === 'string'
        &&
        targetUrl
    ) {

        if (
            targetUrl.startsWith(
                'data:text/html,'
            )
        ) {

            target =
                targetUrl;

        } else {

            let parsed: URL;

            try {

                parsed =
                    new URL(
                        targetUrl
                    );

            } catch {

                throw new Error(
                    'INVALID_LOGIN_TARGET'
                );

            }

            const host =
                parsed.hostname
                    .toLowerCase();

            if (
                parsed.protocol !== 'https:'
                ||
                (
                    host !== 'chatgpt.com'
                    &&
                    host !== 'www.chatgpt.com'
                    &&
                    !host.endsWith('.chatgpt.com')
                )
                ||
                parsed.username
                ||
                parsed.password
            ) {

                throw new Error(
                    'INVALID_LOGIN_TARGET'
                );

            }

            parsed.hash = '';

            target =
                parsed.href;

        }

    }


    const state =
        await manager([
            'start',
            profileKey,
            String(
                row.id
            ),
            target
        ]);


    const db =
        getDatabasePool();


    await db.query(
        `
            INSERT INTO chat_sessions (
                chat_account_id,
                status,
                browser_mode,
                profile_path,
                last_checked_at,
                metadata
            )
            VALUES (
                $1::uuid,
                'ready',
                'visible',
                $2::text,
                now(),
                $3::jsonb
            )
        `,
        [
            row.id,
            state.userDataDir,
            JSON.stringify({
                display:
                    state.display,

                vncPort:
                    state.vncPort,

                noVncPort:
                    state.noVncPort,

                controllerPid:
                    state.controllerPid
            })
        ]
    );


    await db.query(
        `
            INSERT INTO events (
                entity_type,
                entity_id,
                event_type,
                severity,
                actor_type,
                actor_id,
                message,
                data
            )
            VALUES (
                'chat_account',
                ($1::uuid)::text,
                'chat_account.login.started',
                'info',
                'user',
                'private-admin',
                'Visible ChatGPT login session started.',
                jsonb_build_object(
                    'profileKey',
                    $2::text,
                    'display',
                    $3::text,
                    'noVncPort',
                    $4::int
                )
            )
        `,
        [
            row.id,
            profileKey,
            state.display,
            Number(
                state.noVncPort
            )
        ]
    );


    return runtimeResponse(
        row,
        state
    );

}


export async function stopAccountBrowserLogin(
    accountId: string
) {

    const row =
        await account(
            accountId
        );


    const profileKey =
        String(
            row.profile_key
        );


    await manager([
        'stop',
        profileKey
    ]);


    const db =
        getDatabasePool();


    await db.query(
        `
            UPDATE chat_sessions
            SET
                status='stopped',
                last_checked_at=now(),
                updated_at=now()
            WHERE id=(
                SELECT id
                FROM chat_sessions
                WHERE
                    chat_account_id=$1::uuid
                    AND browser_mode='visible'
                ORDER BY created_at DESC
                LIMIT 1
            )
        `,
        [
            row.id
        ]
    );


    await db.query(
        `
            INSERT INTO chat_sessions (
                chat_account_id,
                status,
                browser_mode,
                profile_path,
                last_checked_at,
                metadata
            )
            VALUES (
                $1::uuid,
                'needs_login',
                'headless',
                $2::text,
                now(),
                jsonb_build_object(
                    'reason',
                    'visible_login_finished'
                )
            )
        `,
        [
            row.id,
            `/opt/stagepilot/storage/browser-profiles/${profileKey}`
        ]
    );


    await db.query(
        `
            INSERT INTO events (
                entity_type,
                entity_id,
                event_type,
                severity,
                actor_type,
                actor_id,
                message,
                data
            )
            VALUES (
                'chat_account',
                ($1::uuid)::text,
                'chat_account.login.stopped',
                'info',
                'user',
                'private-admin',
                'Visible ChatGPT login session stopped.',
                jsonb_build_object(
                    'profileKey',
                    $2::text
                )
            )
        `,
        [
            row.id,
            profileKey
        ]
    );


    return {

        status:
            'stopped',

        accountId:
            row.id,

        profileKey

    };

}


const HEADLESS_MANAGER =
    '/opt/stagepilot/apps/worker/browser/headless-session.mjs';


async function readHeadlessState(
    profileKey: string
) {

    const statePath =
        join(
            SESSION_ROOT,
            `${profileKey}.headless.json`
        );


    try {

        return JSON.parse(
            await readFile(
                statePath,
                'utf8'
            )
        );

    } catch {

        return null;

    }

}


async function headlessManager(
    args: string[]
) {

    const result =
        await execFileAsync(
            process.execPath,
            [
                HEADLESS_MANAGER,
                ...args
            ],
            {
                env:
                    process.env,

                cwd:
                    '/opt/stagepilot/apps/worker',

                timeout:
                    90000,

                maxBuffer:
                    1024
                    *
                    1024
            }
        );


    const output =
        result.stdout.trim();


    return output
        ? JSON.parse(
            output
        )
        : null;

}


async function stopLatestSession(
    accountId: string,
    mode: string
) {

    const db =
        getDatabasePool();


    await db.query(
        `
            UPDATE chat_sessions
            SET
                status='stopped',
                last_checked_at=now(),
                updated_at=now()
            WHERE id=(
                SELECT id
                FROM chat_sessions
                WHERE
                    chat_account_id=$1::uuid
                    AND browser_mode=$2::text
                    AND status='ready'
                ORDER BY created_at DESC
                LIMIT 1
            )
        `,
        [
            accountId,
            mode
        ]
    );

}


export async function getAccountBrowserRuntime(
    accountId: string
) {

    const row =
        await account(
            accountId
        );


    const profileKey =
        String(
            row.profile_key
        );


    const [
        visible,
        headless
    ] =
        await Promise.all([

            readRuntimeState(
                profileKey
            ),

            readHeadlessState(
                profileKey
            )

        ]);


    if (
        headless
        &&
        headless.status === 'ready'
        &&
        pidAlive(
            headless.controllerPid
        )
    ) {

        return {

            status:
                'ready',

            mode:
                'headless',

            authState:
                headless.authState
                ??
                'unknown',

            validation:
                headless.validation
                ??
                null,

            accountId:
                row.id,

            profileKey,

            runtime:
                headless

        };

    }


    if (
        visible
        &&
        visible.status === 'ready'
        &&
        pidAlive(
            visible.controllerPid
        )
    ) {

        return {

            status:
                'ready',

            mode:
                'visible',

            authState:
                'validation_pending',

            validation:
                null,

            accountId:
                row.id,

            profileKey,

            runtime:
                visible

        };

    }


    return {

        status:
            'stopped',

        mode:
            'none',

        authState:
            'unknown',

        validation:
            null,

        accountId:
            row.id,

        profileKey,

        runtime:
            null

    };

}


export async function completeAccountBrowserLogin(
    accountId: string
) {

    const row =
        await account(
            accountId
        );


    const profileKey =
        String(
            row.profile_key
        );


    const visible =
        await readRuntimeState(
            profileKey
        );


    if (
        !visible
        ||
        visible.status !== 'ready'
        ||
        !pidAlive(
            visible.controllerPid
        )
    ) {

        throw new Error(
            'VISIBLE_LOGIN_SESSION_REQUIRED'
        );

    }


    await manager([
        'stop',
        profileKey
    ]);


    await stopLatestSession(
        String(
            row.id
        ),
        'visible'
    );


    let headless;


    try {

        headless =
            await headlessManager([
                'start',
                profileKey,
                String(
                    row.id
                ),
                'https://chatgpt.com/'
            ]);

    } catch (error) {

        await manager([
            'start',
            profileKey,
            String(
                row.id
            ),
            'https://chatgpt.com/'
        ]).catch(
            () => {}
        );


        throw error;

    }


    const authState =
        String(
            headless?.authState
            ??
            'unknown'
        );


    const db =
        getDatabasePool();


    if (
        authState
        ===
        'authenticated'
    ) {

        await db.query(
            `
                UPDATE chat_accounts
                SET
                    status='ready',
                    updated_at=now()
                WHERE id=$1::uuid
            `,
            [
                row.id
            ]
        );


        await db.query(
            `
                INSERT INTO chat_sessions (
                    chat_account_id,
                    status,
                    browser_mode,
                    profile_path,
                    last_checked_at,
                    metadata
                )
                VALUES (
                    $1::uuid,
                    'ready',
                    'headless',
                    $2::text,
                    now(),
                    $3::jsonb
                )
            `,
            [
                row.id,
                headless.userDataDir,
                JSON.stringify({

                    authState,

                    validation:
                        headless.validation

                })
            ]
        );


        await db.query(
            `
                INSERT INTO events (
                    entity_type,
                    entity_id,
                    event_type,
                    severity,
                    actor_type,
                    actor_id,
                    message,
                    data
                )
                VALUES (
                    'chat_account',
                    ($1::uuid)::text,
                    'chat_account.headless.ready',
                    'info',
                    'manager',
                    'browser-transition',
                    'ChatGPT authentication was confirmed and Browser transitioned to Headless mode.',
                    jsonb_build_object(
                        'profileKey',
                        $2::text,
                        'authState',
                        $3::text
                    )
                )
            `,
            [
                row.id,
                profileKey,
                authState
            ]
        );


        return {

            transitioned:
                true,

            status:
                'ready',

            mode:
                'headless',

            authState,

            validation:
                headless.validation,

            accountId:
                row.id,

            profileKey

        };

    }


    await headlessManager([
        'stop',
        profileKey
    ]).catch(
        () => {}
    );


    const restored =
        await manager([
            'start',
            profileKey,
            String(
                row.id
            ),
            'https://chatgpt.com/'
        ]);


    await db.query(
        `
            UPDATE chat_accounts
            SET
                status='needs_login',
                updated_at=now()
            WHERE id=$1::uuid
        `,
        [
            row.id
        ]
    );


    await db.query(
        `
            INSERT INTO chat_sessions (
                chat_account_id,
                status,
                browser_mode,
                profile_path,
                last_checked_at,
                metadata
            )
            VALUES (
                $1::uuid,
                'ready',
                'visible',
                $2::text,
                now(),
                $3::jsonb
            )
        `,
        [
            row.id,
            restored.userDataDir,
            JSON.stringify({

                restoredAfterValidation:
                    true,

                authState,

                validation:
                    headless?.validation
                    ??
                    null

            })
        ]
    );


    await db.query(
        `
            INSERT INTO events (
                entity_type,
                entity_id,
                event_type,
                severity,
                actor_type,
                actor_id,
                message,
                data
            )
            VALUES (
                'chat_account',
                ($1::uuid)::text,
                'chat_account.login.validation_failed',
                'warning',
                'manager',
                'browser-transition',
                'Authentication was not confirmed; Visible Login was restored.',
                jsonb_build_object(
                    'profileKey',
                    $2::text,
                    'authState',
                    $3::text
                )
            )
        `,
        [
            row.id,
            profileKey,
            authState
        ]
    );


    return {

        transitioned:
            false,

        status:
            'ready',

        mode:
            'visible',

        authState,

        validation:
            headless?.validation
            ??
            null,

        browserLogin:
            runtimeResponse(
                row,
                restored
            ),

        accountId:
            row.id,

        profileKey

    };

}


export async function stopAccountHeadlessRuntime(
    accountId: string
) {

    const row =
        await account(
            accountId
        );


    const profileKey =
        String(
            row.profile_key
        );


    await headlessManager([
        'stop',
        profileKey
    ]);


    await stopLatestSession(
        String(
            row.id
        ),
        'headless'
    );


    const db =
        getDatabasePool();


    await db.query(
        `
            INSERT INTO events (
                entity_type,
                entity_id,
                event_type,
                severity,
                actor_type,
                actor_id,
                message,
                data
            )
            VALUES (
                'chat_account',
                ($1::uuid)::text,
                'chat_account.headless.stopped',
                'info',
                'user',
                'private-admin',
                'Persistent Headless Browser runtime stopped.',
                jsonb_build_object(
                    'profileKey',
                    $2::text
                )
            )
        `,
        [
            row.id,
            profileKey
        ]
    );


    return {

        status:
            'stopped',

        mode:
            'none',

        authState:
            'unknown',

        accountId:
            row.id,

        profileKey

    };

}

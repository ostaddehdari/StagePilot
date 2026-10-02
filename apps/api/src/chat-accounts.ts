import {
    mkdir,
    chmod,
    rm
} from 'node:fs/promises';


import {
    randomBytes
} from 'node:crypto';


import {
    getDatabasePool
} from './db';


const PROFILE_ROOT =
    process.env
        .STAGEPILOT_BROWSER_PROFILE_ROOT
    ??
    '/opt/stagepilot/storage/browser-profiles';


export type CreateChatAccountInput = {

    label?: unknown;

    note?: unknown;

};


function textValue(
    value: unknown
): string {

    if (
        typeof value
        !==
        'string'
    ) {

        return '';

    }


    return value.trim();

}


function createProfileKey(): string {

    const timestamp =
        Date.now();


    const random =
        randomBytes(
            4
        ).toString(
            'hex'
        );


    return (
        `chat-account-${timestamp}-${random}`
    );

}


function profilePath(
    profileKey: string
): string {

    return (
        `${PROFILE_ROOT}/${profileKey}`
    );

}


export async function listChatAccounts() {

    const db =
        getDatabasePool();


    const result =
        await db.query(`
            SELECT
                a.id,
                a.label,
                a.profile_key,
                a.status,
                a.metadata,
                a.created_at,
                a.updated_at,

                (
                    SELECT
                        cs.status
                    FROM chat_sessions cs
                    WHERE
                        cs.chat_account_id = a.id
                    ORDER BY
                        cs.created_at DESC
                    LIMIT 1
                )
                    AS session_status,

                (
                    SELECT
                        cs.browser_mode
                    FROM chat_sessions cs
                    WHERE
                        cs.chat_account_id = a.id
                    ORDER BY
                        cs.created_at DESC
                    LIMIT 1
                )
                    AS browser_mode,

                (
                    SELECT
                        cs.profile_path
                    FROM chat_sessions cs
                    WHERE
                        cs.chat_account_id = a.id
                    ORDER BY
                        cs.created_at DESC
                    LIMIT 1
                )
                    AS profile_path,

                (
                    SELECT COUNT(*)::int
                    FROM conversations c
                    WHERE
                        c.chat_account_id = a.id
                )
                    AS conversation_count,

                (
                    SELECT COUNT(*)::int
                    FROM projects p
                    WHERE
                        p.selected_chat_account_id = a.id
                )
                    AS selected_project_count

            FROM chat_accounts a

            ORDER BY
                a.created_at DESC
        `);


    return result.rows;

}


export async function getChatAccount(
    id: string
) {

    const db =
        getDatabasePool();


    const accountResult =
        await db.query(
            `
                SELECT
                    a.id,
                    a.label,
                    a.profile_key,
                    a.status,
                    a.metadata,
                    a.created_at,
                    a.updated_at,

                    (
                        SELECT COUNT(*)::int
                        FROM conversations c
                        WHERE
                            c.chat_account_id = a.id
                    )
                        AS conversation_count,

                    (
                        SELECT COUNT(*)::int
                        FROM projects p
                        WHERE
                            p.selected_chat_account_id = a.id
                    )
                        AS selected_project_count

                FROM chat_accounts a

                WHERE
                    a.id = $1::uuid
            `,
            [
                id
            ]
        );


    if (
        accountResult.rowCount
        !==
        1
    ) {

        return null;

    }


    const sessionsResult =
        await db.query(
            `
                SELECT
                    id,
                    status,
                    browser_mode,
                    profile_path,
                    last_checked_at,
                    metadata,
                    created_at,
                    updated_at

                FROM chat_sessions

                WHERE
                    chat_account_id = $1::uuid

                ORDER BY
                    created_at DESC

                LIMIT 20
            `,
            [
                id
            ]
        );


    const conversationsResult =
        await db.query(
            `
                SELECT
                    id,
                    project_id,
                    external_url,
                    external_chat_id,
                    status,
                    sequence_no,
                    started_reason,
                    metadata,
                    created_at,
                    closed_at

                FROM conversations

                WHERE
                    chat_account_id = $1::uuid

                ORDER BY
                    created_at DESC

                LIMIT 20
            `,
            [
                id
            ]
        );


    return {

        account:
            accountResult.rows[0],

        sessions:
            sessionsResult.rows,

        conversations:
            conversationsResult.rows

    };

}


export async function createChatAccount(
    input: CreateChatAccountInput
) {

    const label =
        textValue(
            input.label
        );


    const note =
        textValue(
            input.note
        );


    if (
        label.length < 2
        ||
        label.length > 120
    ) {

        throw new Error(
            'INVALID_CHAT_ACCOUNT_LABEL'
        );

    }


    if (
        note.length
        >
        2000
    ) {

        throw new Error(
            'CHAT_ACCOUNT_NOTE_TOO_LONG'
        );

    }


    const profileKey =
        createProfileKey();


    const path =
        profilePath(
            profileKey
        );


    await mkdir(
        path,
        {
            recursive:
                false,

            mode:
                0o700
        }
    );


    await chmod(
        path,
        0o700
    );


    const db =
        getDatabasePool();


    const client =
        await db.connect();


    try {

        await client.query(
            'BEGIN'
        );


        const accountResult =
            await client.query(
                `
                    INSERT INTO chat_accounts (
                        label,
                        profile_key,
                        status,
                        metadata
                    )
                    VALUES (
                        $1::text,
                        $2::text,
                        'needs_login',
                        $3::jsonb
                    )
                    RETURNING
                        id,
                        label,
                        profile_key,
                        status,
                        metadata,
                        created_at,
                        updated_at
                `,
                [
                    label,
                    profileKey,
                    JSON.stringify({
                        note
                    })
                ]
            );


        const account =
            accountResult.rows[0];


        await client.query(
            `
                INSERT INTO chat_sessions (
                    chat_account_id,
                    status,
                    browser_mode,
                    profile_path,
                    metadata
                )
                VALUES (
                    $1::uuid,
                    'needs_login',
                    'headless',
                    $2::text,
                    jsonb_build_object(
                        'loginMode',
                        'novnc-on-demand',
                        'normalMode',
                        'headless'
                    )
                )
            `,
            [
                account.id,
                path
            ]
        );


        await client.query(
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
                    'chat_account.created',
                    'info',
                    'user',
                    'private-admin',
                    'ChatGPT account profile created and awaiting login.',
                    jsonb_build_object(
                        'label',
                        $2::text,
                        'profileKey',
                        $3::text,
                        'status',
                        'needs_login'
                    )
                )
            `,
            [
                account.id,
                label,
                profileKey
            ]
        );


        await client.query(
            'COMMIT'
        );


        return {

            ...account,

            session_status:
                'needs_login',

            browser_mode:
                'headless',

            profile_path:
                path,

            conversation_count:
                0,

            selected_project_count:
                0

        };

    } catch (error) {

        await client.query(
            'ROLLBACK'
        );


        await rm(
            path,
            {
                recursive:
                    true,

                force:
                    true
            }
        );


        throw error;

    } finally {

        client.release();

    }

}

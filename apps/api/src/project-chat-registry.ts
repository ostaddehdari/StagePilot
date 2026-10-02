import {
    getDatabasePool
} from './db';


export type SelectChatAccountInput = {

    chatAccountId?: unknown;

};


export type CreateConversationInput = {

    mode?: unknown;

    externalUrl?: unknown;

    externalChatId?: unknown;

    startedReason?: unknown;

};


export type ActivateConversationInput = {

    externalUrl?: unknown;

    externalChatId?: unknown;

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


function validateUuid(
    value: string
): string {

    if (
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
            .test(
                value
            )
    ) {

        throw new Error(
            'INVALID_UUID'
        );

    }


    return value;

}


function normalizeChatUrl(
    value: string
): {
    url: string;
    chatId: string | null;
} {

    let url: URL;


    try {

        url =
            new URL(
                value
            );

    } catch {

        throw new Error(
            'INVALID_CHAT_URL'
        );

    }


    if (
        url.protocol
        !==
        'https:'
    ) {

        throw new Error(
            'CHAT_URL_MUST_USE_HTTPS'
        );

    }


    const allowedHosts =
        new Set([

            'chatgpt.com',

            'www.chatgpt.com',

            'chat.openai.com'

        ]);


    if (
        !allowedHosts.has(
            url.hostname.toLowerCase()
        )
    ) {

        throw new Error(
            'UNSUPPORTED_CHAT_HOST'
        );

    }


    url.hash = '';


    const segments =
        url.pathname
            .split('/')
            .filter(
                Boolean
            );


    let chatId:
        string | null = null;


    const cIndex =
        segments.lastIndexOf(
            'c'
        );


    if (
        cIndex >= 0
        &&
        segments[cIndex + 1]
    ) {

        chatId =
            segments[cIndex + 1];

    }


    return {

        url:
            url.toString(),

        chatId

    };

}


export async function getProjectChatRegistry(
    projectId: string
) {

    const db =
        getDatabasePool();


    const projectResult =
        await db.query(
            `
                SELECT
                    p.id,
                    p.name,
                    p.slug,
                    p.selected_chat_account_id,

                    a.label
                        AS selected_chat_account_label,

                    a.status
                        AS selected_chat_account_status,

                    a.profile_key
                        AS selected_chat_profile_key

                FROM projects p

                LEFT JOIN chat_accounts a
                    ON
                        a.id =
                        p.selected_chat_account_id

                WHERE
                    p.id = $1::uuid
            `,
            [
                projectId
            ]
        );


    if (
        projectResult.rowCount
        !==
        1
    ) {

        return null;

    }


    const conversationsResult =
        await db.query(
            `
                SELECT
                    c.id,
                    c.project_id,
                    c.chat_account_id,
                    c.external_url,
                    c.external_chat_id,
                    c.status,
                    c.sequence_no,
                    c.started_reason,
                    c.metadata,
                    c.created_at,
                    c.closed_at,

                    a.label
                        AS chat_account_label

                FROM conversations c

                LEFT JOIN chat_accounts a
                    ON
                        a.id =
                        c.chat_account_id

                WHERE
                    c.project_id = $1::uuid

                ORDER BY
                    c.sequence_no DESC
            `,
            [
                projectId
            ]
        );


    const activeConversation =
        conversationsResult.rows.find(
            conversation =>
                conversation.status
                ===
                'active'
                ||
                conversation.status
                ===
                'pending_creation'
        )
        ??
        null;


    return {

        project:
            projectResult.rows[0],

        activeConversation,

        conversations:
            conversationsResult.rows

    };

}


export async function selectProjectChatAccount(
    projectId: string,
    input: SelectChatAccountInput
) {

    const accountId =
        validateUuid(
            textValue(
                input.chatAccountId
            )
        );


    const db =
        getDatabasePool();


    const client =
        await db.connect();


    try {

        await client.query(
            'BEGIN'
        );


        const projectResult =
            await client.query(
                `
                    SELECT
                        id,
                        selected_chat_account_id
                    FROM projects
                    WHERE
                        id = $1::uuid
                    FOR UPDATE
                `,
                [
                    projectId
                ]
            );


        if (
            projectResult.rowCount
            !==
            1
        ) {

            throw new Error(
                'PROJECT_NOT_FOUND'
            );

        }


        const accountResult =
            await client.query(
                `
                    SELECT
                        id,
                        label,
                        status,
                        profile_key
                    FROM chat_accounts
                    WHERE
                        id = $1::uuid
                `,
                [
                    accountId
                ]
            );


        if (
            accountResult.rowCount
            !==
            1
        ) {

            throw new Error(
                'CHAT_ACCOUNT_NOT_FOUND'
            );

        }


        const previousId =
            projectResult.rows[0]
                .selected_chat_account_id;


        if (
            previousId
            &&
            String(
                previousId
            )
            !==
            accountId
        ) {

            await client.query(
                `
                    UPDATE conversations
                    SET
                        status = 'closed',
                        closed_at = COALESCE(
                            closed_at,
                            now()
                        ),
                        metadata =
                            metadata
                            ||
                            jsonb_build_object(
                                'closedReason',
                                'chat_account_changed'
                            )
                    WHERE
                        project_id = $1::uuid
                        AND
                        status IN (
                            'active',
                            'pending_creation'
                        )
                `,
                [
                    projectId
                ]
            );

        }


        await client.query(
            `
                UPDATE projects
                SET
                    selected_chat_account_id = $2::uuid,
                    updated_at = now()
                WHERE
                    id = $1::uuid
            `,
            [
                projectId,
                accountId
            ]
        );


        await client.query(
            `
                INSERT INTO events (
                    project_id,
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
                    $1::uuid,
                    'project',
                    ($1::uuid)::text,
                    'project.chat_account.selected',
                    'info',
                    'user',
                    'private-admin',
                    'ChatGPT account selected for project.',
                    jsonb_build_object(
                        'chatAccountId',
                        ($2::uuid)::text,
                        'label',
                        $3::text
                    )
                )
            `,
            [
                projectId,
                accountId,
                accountResult.rows[0].label
            ]
        );


        await client.query(
            'COMMIT'
        );


        return accountResult.rows[0];

    } catch (error) {

        await client.query(
            'ROLLBACK'
        );


        throw error;

    } finally {

        client.release();

    }

}


export async function createProjectConversation(
    projectId: string,
    input: CreateConversationInput
) {

    const mode =
        textValue(
            input.mode
        );


    if (
        mode !== 'existing'
        &&
        mode !== 'new'
    ) {

        throw new Error(
            'INVALID_CONVERSATION_MODE'
        );

    }


    const startedReason =
        textValue(
            input.startedReason
        )
        ||
        (
            mode === 'existing'
                ? 'existing_chat_registered'
                : 'new_chat_requested'
        );


    let externalUrl:
        string | null = null;


    let externalChatId:
        string | null =
            textValue(
                input.externalChatId
            )
            ||
            null;


    if (
        mode === 'existing'
    ) {

        const rawUrl =
            textValue(
                input.externalUrl
            );


        if (!rawUrl) {

            throw new Error(
                'EXISTING_CHAT_URL_REQUIRED'
            );

        }


        const normalized =
            normalizeChatUrl(
                rawUrl
            );


        externalUrl =
            normalized.url;


        if (
            !externalChatId
            &&
            normalized.chatId
        ) {

            externalChatId =
                normalized.chatId;

        }

    }


    const db =
        getDatabasePool();


    const client =
        await db.connect();


    try {

        await client.query(
            'BEGIN'
        );


        const projectResult =
            await client.query(
                `
                    SELECT
                        id,
                        selected_chat_account_id
                    FROM projects
                    WHERE
                        id = $1::uuid
                    FOR UPDATE
                `,
                [
                    projectId
                ]
            );


        if (
            projectResult.rowCount
            !==
            1
        ) {

            throw new Error(
                'PROJECT_NOT_FOUND'
            );

        }


        const accountId =
            projectResult.rows[0]
                .selected_chat_account_id;


        if (!accountId) {

            throw new Error(
                'PROJECT_CHAT_ACCOUNT_REQUIRED'
            );

        }


        await client.query(
            `
                UPDATE conversations
                SET
                    status = 'closed',
                    closed_at = COALESCE(
                        closed_at,
                        now()
                    ),
                    metadata =
                        metadata
                        ||
                        jsonb_build_object(
                            'closedReason',
                            'conversation_replaced'
                        )
                WHERE
                    project_id = $1::uuid
                    AND
                    status IN (
                        'active',
                        'pending_creation'
                    )
            `,
            [
                projectId
            ]
        );


        const sequenceResult =
            await client.query(
                `
                    SELECT
                        COALESCE(
                            MAX(
                                sequence_no
                            ),
                            0
                        )
                        +
                        1
                        AS next_sequence
                    FROM conversations
                    WHERE
                        project_id = $1::uuid
                `,
                [
                    projectId
                ]
            );


        const sequenceNo =
            Number(
                sequenceResult.rows[0]
                    .next_sequence
            );


        const status =
            mode === 'existing'
                ? 'active'
                : 'pending_creation';


        const insertResult =
            await client.query(
                `
                    INSERT INTO conversations (
                        project_id,
                        chat_account_id,
                        external_url,
                        external_chat_id,
                        status,
                        sequence_no,
                        started_reason,
                        metadata
                    )
                    VALUES (
                        $1::uuid,
                        $2::uuid,
                        $3::text,
                        $4::text,
                        $5::text,
                        $6,
                        $7::text,
                        jsonb_build_object(
                            'mode',
                            $8::text
                        )
                    )
                    RETURNING
                        id,
                        project_id,
                        chat_account_id,
                        external_url,
                        external_chat_id,
                        status,
                        sequence_no,
                        started_reason,
                        metadata,
                        created_at,
                        closed_at
                `,
                [
                    projectId,
                    accountId,
                    externalUrl,
                    externalChatId,
                    status,
                    sequenceNo,
                    startedReason,
                    mode
                ]
            );


        const conversation =
            insertResult.rows[0];


        await client.query(
            `
                INSERT INTO events (
                    project_id,
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
                    $1::uuid,
                    'conversation',
                    ($2::uuid)::text,
                    'conversation.registered',
                    'info',
                    'user',
                    'private-admin',
                    'Project conversation registered.',
                    jsonb_build_object(
                        'mode',
                        $3::text,
                        'sequence',
                        $4::int,
                        'status',
                        $5::text
                    )
                )
            `,
            [
                projectId,
                conversation.id,
                mode,
                sequenceNo,
                status
            ]
        );


        await client.query(
            'COMMIT'
        );


        return conversation;

    } catch (error) {

        await client.query(
            'ROLLBACK'
        );


        throw error;

    } finally {

        client.release();

    }

}


export async function activateProjectConversation(
    projectId: string,
    conversationId: string,
    input: ActivateConversationInput
) {

    const normalized =
        normalizeChatUrl(
            textValue(
                input.externalUrl
            )
        );


    const suppliedChatId =
        textValue(
            input.externalChatId
        );


    const chatId =
        suppliedChatId
        ||
        normalized.chatId;


    const db =
        getDatabasePool();


    const client =
        await db.connect();


    try {

        await client.query(
            'BEGIN'
        );


        const result =
            await client.query(
                `
                    UPDATE conversations
                    SET
                        external_url = $3::text,
                        external_chat_id = $4::text,
                        status = 'active',
                        metadata =
                            metadata
                            ||
                            jsonb_build_object(
                                'activatedAt',
                                now()
                            )
                    WHERE
                        id = $2::uuid
                        AND
                        project_id = $1::uuid
                        AND
                        status = 'pending_creation'
                    RETURNING
                        id,
                        project_id,
                        chat_account_id,
                        external_url,
                        external_chat_id,
                        status,
                        sequence_no,
                        started_reason,
                        metadata,
                        created_at,
                        closed_at
                `,
                [
                    projectId,
                    conversationId,
                    normalized.url,
                    chatId
                ]
            );


        if (
            result.rowCount
            !==
            1
        ) {

            throw new Error(
                'PENDING_CONVERSATION_NOT_FOUND'
            );

        }


        await client.query(
            `
                INSERT INTO events (
                    project_id,
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
                    $1::uuid,
                    'conversation',
                    ($2::uuid)::text,
                    'conversation.activated',
                    'info',
                    'manager',
                    'conversation-registry',
                    'Pending conversation received its ChatGPT URL.',
                    jsonb_build_object(
                        'externalUrl',
                        $3::text
                    )
                )
            `,
            [
                projectId,
                conversationId,
                normalized.url
            ]
        );


        await client.query(
            'COMMIT'
        );


        return result.rows[0];

    } catch (error) {

        await client.query(
            'ROLLBACK'
        );


        throw error;

    } finally {

        client.release();

    }

}

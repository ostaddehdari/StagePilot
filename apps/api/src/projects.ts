import {
    randomBytes
} from 'node:crypto';


import {
    getDatabasePool
} from './db';


export type CreateProjectInput = {

    name?: unknown;

    slug?: unknown;

    description?: unknown;

    requestText?: unknown;

};


export type UpdateProjectInput = {

    name?: unknown;

    slug?: unknown;

    description?: unknown;

    status?: unknown;

    repositoryName?: unknown;

    chatMode?: unknown;

};


function textValue(
    value: unknown
): string {

    if (typeof value !== 'string') {

        return '';

    }


    return value.trim();

}


function generateSlug(): string {

    const now =
        new Date()
            .toISOString()
            .replace(
                /[^0-9]/g,
                ''
            )
            .slice(
                0,
                14
            );


    const suffix =
        randomBytes(
            3
        ).toString(
            'hex'
        );


    return `project-${now}-${suffix}`;

}


function validateSlug(
    value: string
): string {

    if (!value) {

        return generateSlug();

    }


    const slug =
        value.toLowerCase();


    if (
        !/^[a-z0-9][a-z0-9-]{2,62}$/
            .test(
                slug
            )
    ) {

        throw new Error(
            'INVALID_PROJECT_SLUG'
        );

    }


    return slug;

}


function normalizeProject(
    row: Record<string, unknown>
) {

    return {

        ...row,

        stage_count:
            Number(
                row.stage_count
                ??
                0
            ),

        work_count:
            Number(
                row.work_count
                ??
                0
            ),

        completed_work_count:
            Number(
                row.completed_work_count
                ??
                0
            ),

        progress_percent:
            Number(
                row.progress_percent
                ??
                0
            )

    };

}


export async function listProjects() {

    const db =
        getDatabasePool();


    const result =
        await db.query(`
            SELECT
                p.id,
                p.slug,
                p.name,
                p.description,
                p.status,
                p.settings,
                p.current_plan_revision,
                p.created_at,
                p.updated_at,

                COUNT(
                    DISTINCT s.id
                )::int
                    AS stage_count,

                COUNT(
                    DISTINCT w.id
                )::int
                    AS work_count,

                COUNT(
                    DISTINCT w.id
                )
                FILTER (
                    WHERE
                        w.status = 'completed'
                )::int
                    AS completed_work_count,

                CASE

                    WHEN
                        COUNT(
                            DISTINCT w.id
                        ) = 0
                    THEN 0

                    ELSE
                        ROUND(
                            (
                                COUNT(
                                    DISTINCT w.id
                                )
                                FILTER (
                                    WHERE
                                        w.status = 'completed'
                                )::numeric
                                * 100
                            )
                            /
                            COUNT(
                                DISTINCT w.id
                            ),
                            1
                        )

                END
                    AS progress_percent

            FROM projects p

            LEFT JOIN stages s
                ON
                    s.project_id = p.id
                    AND
                    s.revision = p.current_plan_revision

            LEFT JOIN works w
                ON
                    w.stage_id = s.id

            WHERE
                p.deleted_at IS NULL

            GROUP BY
                p.id

            ORDER BY
                p.created_at DESC
        `);


    return result.rows.map(
        normalizeProject
    );

}


export async function getProject(
    id: string
) {

    const db =
        getDatabasePool();


    const projectResult =
        await db.query(
            `
                SELECT
                    p.id,
                    p.slug,
                    p.name,
                    p.description,
                    p.status,
                    p.current_plan_revision,
                    p.settings,
                    p.created_at,
                    p.updated_at,

                    COUNT(
                        DISTINCT s.id
                    )::int
                        AS stage_count,

                    COUNT(
                        DISTINCT w.id
                    )::int
                        AS work_count,

                    COUNT(
                        DISTINCT w.id
                    )
                    FILTER (
                        WHERE
                            w.status = 'completed'
                    )::int
                        AS completed_work_count,

                    CASE

                        WHEN
                            COUNT(
                                DISTINCT w.id
                            ) = 0
                        THEN 0

                        ELSE
                            ROUND(
                                (
                                    COUNT(
                                        DISTINCT w.id
                                    )
                                    FILTER (
                                        WHERE
                                            w.status = 'completed'
                                    )::numeric
                                    * 100
                                )
                                /
                                COUNT(
                                    DISTINCT w.id
                                ),
                                1
                            )

                    END
                        AS progress_percent

                FROM projects p

                LEFT JOIN stages s
                    ON
                        s.project_id = p.id
                        AND
                        s.revision = p.current_plan_revision

                LEFT JOIN works w
                    ON
                        w.stage_id = s.id

                WHERE
                    p.id = $1::uuid
                    AND
                    p.deleted_at IS NULL

                GROUP BY
                    p.id
            `,
            [
                id
            ]
        );


    if (
        projectResult.rowCount
        !==
        1
    ) {

        return null;

    }


    const revisionResult =
        await db.query(
            `
                SELECT
                    id,
                    revision,
                    source,
                    request_text,
                    plan_json,
                    approved,
                    approved_at,
                    created_at

                FROM project_revisions

                WHERE
                    project_id = $1::uuid

                ORDER BY
                    revision DESC

                LIMIT 1
            `,
            [
                id
            ]
        );


    return {

        project:
            normalizeProject(
                projectResult.rows[0]
            ),

        revision:
            revisionResult.rows[0]
            ??
            null

    };

}


export async function updateProject(
    id: string,
    input: UpdateProjectInput
) {

    const name = textValue(input.name);
    const slug = validateSlug(textValue(input.slug));
    const description = textValue(input.description);
    const status = textValue(input.status) || 'draft';
    const repositoryName = textValue(input.repositoryName);
    const chatMode = textValue(input.chatMode) || 'existing';

    if (name.length < 2 || name.length > 160) {
        throw new Error('INVALID_PROJECT_NAME');
    }

    if (description.length > 5000) {
        throw new Error('PROJECT_DESCRIPTION_TOO_LONG');
    }

    if (!['draft', 'active', 'paused', 'completed'].includes(status)) {
        throw new Error('INVALID_PROJECT_STATUS');
    }

    if (
        repositoryName
        &&
        !/^[A-Za-z0-9._-]{1,100}$/.test(repositoryName)
    ) {
        throw new Error('INVALID_REPOSITORY_NAME');
    }

    if (!['existing', 'new'].includes(chatMode)) {
        throw new Error('INVALID_CHAT_MODE');
    }

    const db = getDatabasePool();
    const result = await db.query(
        `UPDATE projects
         SET name = $2,
             slug = $3,
             description = NULLIF($4, ''),
             status = $5,
             settings = settings || jsonb_build_object(
                'repositoryName', $6::text,
                'chatMode', $7::text
             ),
             updated_at = now()
         WHERE id = $1::uuid
           AND deleted_at IS NULL
         RETURNING id, slug, name, description, status,
                   current_plan_revision, settings, created_at, updated_at`,
        [
            id,
            name,
            slug,
            description,
            status,
            repositoryName,
            chatMode
        ]
    );

    if (result.rowCount !== 1) {
        throw new Error('PROJECT_NOT_FOUND');
    }

    await db.query(
        `INSERT INTO events (
            project_id, entity_type, entity_id, event_type, severity,
            actor_type, actor_id, message, data
         )
         VALUES (
            $1::uuid, 'project', $1::text, 'project.updated', 'info',
            'user', 'private-admin', 'Project settings updated.',
            jsonb_build_object(
                'repositoryName', $2::text,
                'chatMode', $3::text
            )
         )`,
        [id, repositoryName, chatMode]
    );

    return normalizeProject(result.rows[0]);
}


export async function deleteProject(
    id: string
) {

    const db = getDatabasePool();
    const result = await db.query(
        `UPDATE projects
         SET deleted_at = now(),
             status = 'paused',
             updated_at = now(),
             settings = settings || jsonb_build_object(
                'deletedBy', 'private-admin',
                'deletedAt', now()
             )
         WHERE id = $1::uuid
           AND deleted_at IS NULL
         RETURNING id, slug, name, deleted_at`,
        [id]
    );

    if (result.rowCount !== 1) {
        throw new Error('PROJECT_NOT_FOUND');
    }

    await db.query(
        `INSERT INTO events (
            project_id, entity_type, entity_id, event_type, severity,
            actor_type, actor_id, message, data
         )
         VALUES (
            $1::uuid, 'project', $1::text, 'project.deleted', 'warning',
            'user', 'private-admin',
            'Project soft-deleted; evidence and history retained.',
            jsonb_build_object('recoverable', true)
         )`,
        [id]
    );

    return result.rows[0];
}


export async function createProject(
    input: CreateProjectInput
) {

    const name =
        textValue(
            input.name
        );


    const description =
        textValue(
            input.description
        );


    const requestText =
        textValue(
            input.requestText
        );


    const slug =
        validateSlug(
            textValue(
                input.slug
            )
        );


    if (
        name.length < 2
        ||
        name.length > 160
    ) {

        throw new Error(
            'INVALID_PROJECT_NAME'
        );

    }


    if (
        description.length
        >
        5000
    ) {

        throw new Error(
            'PROJECT_DESCRIPTION_TOO_LONG'
        );

    }


    if (
        requestText.length < 10
        ||
        requestText.length > 30000
    ) {

        throw new Error(
            'INVALID_PROJECT_REQUEST'
        );

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
                    INSERT INTO projects (
                        slug,
                        name,
                        description,
                        status,
                        current_plan_revision,
                        settings
                    )
                    VALUES (
                        $1,
                        $2,
                        $3,
                        'draft',
                        1,
                        jsonb_build_object(
                            'planningStatus',
                            'awaiting_planning'
                        )
                    )
                    RETURNING
                        id,
                        slug,
                        name,
                        description,
                        status,
                        current_plan_revision,
                        created_at,
                        updated_at
                `,
                [
                    slug,
                    name,
                    description || null
                ]
            );


        const project =
            projectResult.rows[0];


        await client.query(
            `
                INSERT INTO project_revisions (
                    project_id,
                    revision,
                    source,
                    request_text,
                    plan_json,
                    approved
                )
                VALUES (
                    $1::uuid,
                    1,
                    'user',
                    $2,
                    jsonb_build_object(
                        'status',
                        'awaiting_planning',
                        'stages',
                        jsonb_build_array()
                    ),
                    false
                )
            `,
            [
                project.id,
                requestText
            ]
        );


        await client.query(
            `
                INSERT INTO project_planning_messages (
                    project_id,
                    revision,
                    role,
                    message_type,
                    content,
                    payload
                )
                VALUES (
                    $1::uuid,
                    1,
                    'user',
                    'idea',
                    $2,
                    jsonb_build_object(
                        'source',
                        'project_creation'
                    )
                )
            `,
            [
                project.id,
                requestText
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
                    'project.created',
                    'info',
                    'user',
                    'private-admin',
                    'Project created and waiting for planning.',
                    jsonb_build_object(
                        'slug',
                        $2::text,
                        'revision',
                        1
                    )
                )
            `,
            [
                project.id,
                project.slug
            ]
        );


        await client.query(
            'COMMIT'
        );


        return {

            ...project,

            stage_count:
                0,

            work_count:
                0,

            completed_work_count:
                0,

            progress_percent:
                0

        };

    } catch (error) {

        await client.query(
            'ROLLBACK'
        );


        if (
            typeof error === 'object'
            &&
            error
            &&
            'code' in error
            &&
            error.code === '23505'
        ) {

            throw new Error(
                'PROJECT_SLUG_EXISTS'
            );

        }


        throw error;

    } finally {

        client.release();

    }

}

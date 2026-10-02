import {
    Pool
} from 'pg';


let pool: Pool | undefined;


export function getDatabasePool(): Pool {

    if (pool) {
        return pool;
    }


    const connectionString =
        process.env.DATABASE_URL;


    if (!connectionString) {

        throw new Error(
            'DATABASE_URL is required'
        );

    }


    pool = new Pool({

        connectionString,

        max: 5,

        idleTimeoutMillis: 30_000,

        connectionTimeoutMillis: 5_000,

        application_name:
            'stagepilot-api'

    });


    return pool;

}


export async function databaseHealth() {

    const db =
        getDatabasePool();


    const result =
        await db.query(`
            SELECT
                current_database() AS database_name,
                current_user AS database_user,
                (
                    SELECT version
                    FROM schema_migrations
                    ORDER BY applied_at DESC
                    LIMIT 1
                ) AS migration,
                (
                    SELECT COUNT(*)::text
                    FROM events
                ) AS event_count
        `);


    return result.rows[0];

}


export async function dashboardSummary() {

    const db =
        getDatabasePool();


    const counts =
        await db.query(`
            SELECT
                (SELECT COUNT(*) FROM projects)::int
                    AS projects,

                (SELECT COUNT(*) FROM stages)::int
                    AS stages,

                (SELECT COUNT(*) FROM works)::int
                    AS works,

                (SELECT COUNT(*) FROM prompt_requests)::int
                    AS prompts,

                (SELECT COUNT(*) FROM runs)::int
                    AS runs,

                (SELECT COUNT(*) FROM events)::int
                    AS events,

                (
                    SELECT COUNT(*)
                    FROM runs
                    WHERE status IN (
                        'running',
                        'created'
                    )
                )::int
                    AS active_runs
        `);


    const recentEvents =
        await db.query(`
            SELECT
                id,
                event_type,
                severity,
                actor_id,
                message,
                created_at
            FROM events
            ORDER BY id DESC
            LIMIT 8
        `);


    return {

        counts:
            counts.rows[0],

        recentEvents:
            recentEvents.rows

    };

}


export async function closeDatabasePool() {

    if (!pool) {
        return;
    }


    await pool.end();

    pool = undefined;

}

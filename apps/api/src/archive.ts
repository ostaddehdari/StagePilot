import {
    getDatabasePool
} from './db';


export async function getArchiveSummary() {

    const db =
        getDatabasePool();


    const countsResult =
        await db.query(`
            SELECT
                (
                    SELECT COUNT(*)
                    FROM prompt_requests
                )::int AS prompts,

                (
                    SELECT COUNT(*)
                    FROM prompt_responses
                )::int AS responses,

                (
                    SELECT COUNT(*)
                    FROM scripts
                )::int AS scripts,

                (
                    SELECT COUNT(*)
                    FROM runs
                )::int AS runs,

                (
                    SELECT COUNT(*)
                    FROM run_logs
                )::int AS logs,

                (
                    SELECT COUNT(*)
                    FROM test_results
                )::int AS test_results,

                (
                    SELECT COUNT(*)
                    FROM git_operations
                )::int AS git_operations
        `);


    const promptResult =
        await db.query(`
            SELECT
                pr.id,
                pr.request_key,
                pr.request_type,
                pr.status,
                pr.state_revision,
                pr.sent_at,
                pr.completed_at,
                pr.created_at,

                p.id
                    AS project_id,

                p.name
                    AS project_name,

                s.stage_key,

                w.work_key,

                (
                    SELECT COUNT(*)::int
                    FROM prompt_responses r
                    WHERE
                        r.prompt_request_id = pr.id
                )
                    AS response_count

            FROM prompt_requests pr

            LEFT JOIN projects p
                ON
                    p.id = pr.project_id

            LEFT JOIN stages s
                ON
                    s.id = pr.stage_id

            LEFT JOIN works w
                ON
                    w.id = pr.work_id

            ORDER BY
                pr.created_at DESC

            LIMIT 20
        `);


    const runResult =
        await db.query(`
            SELECT
                r.id,
                r.run_key,
                r.attempt,
                r.target_server,
                r.workspace,
                r.status,
                r.exit_code,
                r.started_at,
                r.finished_at,
                r.created_at,

                p.id
                    AS project_id,

                p.name
                    AS project_name,

                s.stage_key,

                w.work_key,

                sc.filename
                    AS script_filename,

                (
                    SELECT COUNT(*)::int
                    FROM run_logs rl
                    WHERE
                        rl.run_id = r.id
                )
                    AS log_count

            FROM runs r

            LEFT JOIN projects p
                ON
                    p.id = r.project_id

            LEFT JOIN stages s
                ON
                    s.id = r.stage_id

            LEFT JOIN works w
                ON
                    w.id = r.work_id

            LEFT JOIN scripts sc
                ON
                    sc.id = r.script_id

            ORDER BY
                r.created_at DESC

            LIMIT 20
        `);


    const gitResult =
        await db.query(`
            SELECT
                g.id,
                g.operation_type,
                g.repository,
                g.branch,
                g.commit_sha,
                g.status,
                g.created_at,
                g.completed_at,

                p.name
                    AS project_name,

                w.work_key

            FROM git_operations g

            LEFT JOIN projects p
                ON
                    p.id = g.project_id

            LEFT JOIN works w
                ON
                    w.id = g.work_id

            ORDER BY
                g.created_at DESC

            LIMIT 15
        `);


    return {

        counts:
            countsResult.rows[0],

        recentPrompts:
            promptResult.rows,

        recentRuns:
            runResult.rows,

        recentGit:
            gitResult.rows

    };

}


export async function getPromptArchive(
    promptId: string
) {

    const db =
        getDatabasePool();


    const promptResult =
        await db.query(
            `
                SELECT
                    pr.id,
                    pr.request_key,
                    pr.request_type,
                    pr.prompt_text,
                    pr.context_json,
                    pr.state_revision,
                    pr.status,
                    pr.send_attempts,
                    pr.claimed_at,
                    pr.claimed_by,
                    pr.last_error,
                    pr.next_attempt_at,
                    pr.sent_at,
                    pr.completed_at,
                    pr.created_at,

                    p.id
                        AS project_id,

                    p.name
                        AS project_name,

                    s.stage_key,

                    s.title
                        AS stage_title,

                    w.work_key,

                    w.title
                        AS work_title,

                    c.sequence_no
                        AS conversation_sequence,

                    c.external_url
                        AS conversation_url

                FROM prompt_requests pr

                LEFT JOIN projects p
                    ON
                        p.id = pr.project_id

                LEFT JOIN stages s
                    ON
                        s.id = pr.stage_id

                LEFT JOIN works w
                    ON
                        w.id = pr.work_id

                LEFT JOIN conversations c
                    ON
                        c.id = pr.conversation_id

                WHERE
                    pr.id = $1::uuid
            `,
            [
                promptId
            ]
        );


    if (
        promptResult.rowCount
        !==
        1
    ) {

        return null;

    }


    const responsesResult =
        await db.query(
            `
                SELECT
                    id,
                    response_type,
                    raw_text,
                    parsed_json,
                    extraction_status,
                    is_complete,
                    received_at

                FROM prompt_responses

                WHERE
                    prompt_request_id = $1::uuid

                ORDER BY
                    received_at,
                    id
            `,
            [
                promptId
            ]
        );


    const scriptsResult =
        await db.query(
            `
                SELECT
                    sc.id,
                    sc.script_key,
                    sc.filename,
                    sc.content,
                    sc.sha256,
                    sc.position,
                    sc.capabilities,
                    sc.status,
                    sc.metadata,
                    sc.created_at,

                    sb.id
                        AS batch_id,

                    sb.batch_key,

                    sb.status
                        AS batch_status,

                    pr.id
                        AS prompt_response_id

                FROM scripts sc

                INNER JOIN script_batches sb
                    ON
                        sb.id = sc.batch_id

                INNER JOIN prompt_responses pr
                    ON
                        pr.id = sb.prompt_response_id

                WHERE
                    pr.prompt_request_id = $1::uuid

                ORDER BY
                    sb.created_at,
                    sc.position,
                    sc.created_at
            `,
            [
                promptId
            ]
        );


    const attemptsResult =
        await db.query(
            `
                SELECT
                    paa.id,
                    paa.attempt,
                    paa.status,
                    paa.run_key,
                    paa.workspace_path,
                    paa.test_command,
                    paa.commit_sha,
                    paa.result_json,
                    paa.error_text,
                    paa.started_at,
                    paa.completed_at,
                    paa.created_at,
                    COALESCE((
                        SELECT string_agg(
                            '[' || rl.stream || '] ' || rl.chunk,
                            E'\n'
                            ORDER BY rl.created_at, rl.stream, rl.sequence_no, rl.id
                        )
                        FROM runs rr
                        INNER JOIN run_logs rl ON rl.run_id = rr.id
                        WHERE rr.run_key = paa.run_key
                          AND (rl.stream = 'worker:error' OR rl.stream LIKE '%stderr%')
                    ), '') AS worker_error_log
                FROM project_automation_attempts paa
                WHERE paa.prompt_request_id = $1::uuid
                ORDER BY paa.created_at, paa.attempt
            `,
            [promptId]
        );


    const runsResult =
        await db.query(
            `
                SELECT
                    r.id,
                    r.run_key,
                    r.attempt,
                    r.target_server,
                    r.workspace,
                    r.status,
                    r.exit_code,
                    r.started_at,
                    r.finished_at,
                    r.result_json,
                    r.created_at,

                    sc.filename
                        AS script_filename,

                    paa.status
                        AS attempt_status,

                    paa.error_text
                        AS worker_error,

                    COALESCE((
                        SELECT string_agg(
                            '[' || rl.stream || '] ' || rl.chunk,
                            E'\n'
                            ORDER BY rl.created_at, rl.stream, rl.sequence_no, rl.id
                        )
                        FROM run_logs rl
                        WHERE rl.run_id = r.id
                          AND (rl.stream = 'worker:error' OR rl.stream LIKE '%stderr%')
                    ), '') AS worker_error_log,

                    (
                        SELECT COUNT(*)::int
                        FROM run_logs rl
                        WHERE
                            rl.run_id = r.id
                    )
                        AS log_count

                FROM runs r

                LEFT JOIN scripts sc
                    ON
                        sc.id = r.script_id

                LEFT JOIN script_batches sb
                    ON
                        sb.id = sc.batch_id

                LEFT JOIN prompt_responses pres
                    ON
                        pres.id = sb.prompt_response_id

                LEFT JOIN project_automation_attempts paa
                    ON
                        paa.run_key = r.run_key

                WHERE
                    pres.prompt_request_id = $1::uuid
                    OR paa.prompt_request_id = $1::uuid

                ORDER BY
                    r.created_at
            `,
            [
                promptId
            ]
        );


    const workerErrors: Array<Record<string, unknown>> = [];
    const seenErrors = new Set<string>();
    const addWorkerError = (
        source: string,
        summary: unknown,
        detail: unknown,
        createdAt: unknown
    ) => {
        const summaryText = typeof summary === 'string' ? summary.trim() : '';
        const detailText = typeof detail === 'string' ? detail.trim() : '';
        if (!summaryText && !detailText) return;
        const key = `${source}\u0000${summaryText}\u0000${detailText}`;
        if (seenErrors.has(key)) return;
        seenErrors.add(key);
        workerErrors.push({
            source,
            summary: summaryText,
            detail: detailText,
            created_at: createdAt
        });
    };

    addWorkerError(
        'prompt_request',
        promptResult.rows[0].last_error,
        promptResult.rows[0].context_json?.workerErrorDetail,
        promptResult.rows[0].completed_at ?? promptResult.rows[0].created_at
    );
    for (const attempt of attemptsResult.rows) {
        addWorkerError(
            `automation_attempt:${attempt.attempt}`,
            attempt.error_text,
            attempt.result_json?.errorDetail || attempt.worker_error_log,
            attempt.completed_at ?? attempt.created_at
        );
    }
    for (const run of runsResult.rows) {
        addWorkerError(
            `run:${run.run_key}`,
            run.worker_error ?? run.result_json?.error,
            run.worker_error_log || run.result_json?.errorDetail,
            run.finished_at ?? run.created_at
        );
    }


    return {

        prompt:
            promptResult.rows[0],

        responses:
            responsesResult.rows,

        scripts:
            scriptsResult.rows,

        attempts:
            attemptsResult.rows,

        runs:
            runsResult.rows,

        workerErrors

    };

}


export async function getRunArchive(
    runId: string
) {

    const db =
        getDatabasePool();


    const runResult =
        await db.query(
            `
                SELECT
                    r.id,
                    r.run_key,
                    r.attempt,
                    r.target_server,
                    r.workspace,
                    r.status,
                    r.exit_code,
                    r.started_at,
                    r.finished_at,
                    r.result_json,
                    r.created_at,

                    p.id
                        AS project_id,

                    p.name
                        AS project_name,

                    s.stage_key,

                    s.title
                        AS stage_title,

                    w.id
                        AS work_id,

                    w.work_key,

                    w.title
                        AS work_title,

                    sc.id
                        AS script_id,

                    sc.filename
                        AS script_filename,

                    sc.sha256
                        AS script_sha256,

                    sc.content
                        AS script_content

                FROM runs r

                LEFT JOIN projects p
                    ON
                        p.id = r.project_id

                LEFT JOIN stages s
                    ON
                        s.id = r.stage_id

                LEFT JOIN works w
                    ON
                        w.id = r.work_id

                LEFT JOIN scripts sc
                    ON
                        sc.id = r.script_id

                WHERE
                    r.id = $1::uuid
            `,
            [
                runId
            ]
        );


    if (
        runResult.rowCount
        !==
        1
    ) {

        return null;

    }


    const logsResult =
        await db.query(
            `
                SELECT
                    id,
                    stream,
                    sequence_no,
                    chunk,
                    created_at

                FROM run_logs

                WHERE
                    run_id = $1::uuid

                ORDER BY
                    sequence_no,
                    id
            `,
            [
                runId
            ]
        );


    const testsResult =
        await db.query(
            `
                SELECT
                    tr.id,
                    tr.status,
                    tr.evidence,
                    tr.started_at,
                    tr.finished_at,
                    tr.created_at,

                    t.test_key,
                    t.title,
                    t.kind,
                    t.required

                FROM test_results tr

                INNER JOIN tests t
                    ON
                        t.id = tr.test_id

                WHERE
                    tr.run_id = $1::uuid

                ORDER BY
                    tr.created_at
            `,
            [
                runId
            ]
        );


    const run =
        runResult.rows[0];


    let gitOperations:
        Record<string, unknown>[] =
        [];


    if (
        run.project_id
        &&
        run.work_id
    ) {

        const gitResult =
            await db.query(
                `
                    SELECT
                        id,
                        operation_type,
                        repository,
                        branch,
                        commit_sha,
                        status,
                        result_json,
                        created_at,
                        completed_at

                    FROM git_operations

                    WHERE
                        project_id = $1::uuid
                        AND
                        work_id = $2::uuid

                    ORDER BY
                        created_at DESC

                    LIMIT 20
                `,
                [
                    run.project_id,
                    run.work_id
                ]
            );


        gitOperations =
            gitResult.rows;

    }


    return {

        run,

        logs:
            logsResult.rows,

        tests:
            testsResult.rows,

        gitOperations

    };

}

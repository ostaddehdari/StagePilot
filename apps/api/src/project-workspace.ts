import {
    getDatabasePool
} from './db';


function numberValue(
    value: unknown
): number {

    const number =
        Number(
            value ?? 0
        );


    if (
        !Number.isFinite(
            number
        )
    ) {

        return 0;

    }


    return number;

}


export async function getProjectWorkspace(
    projectId: string
) {

    const db =
        getDatabasePool();


    const projectCheck =
        await db.query(
            `
                SELECT
                    id,
                    current_plan_revision
                FROM projects
                WHERE id = $1::uuid
            `,
            [
                projectId
            ]
        );


    if (
        projectCheck.rowCount
        !==
        1
    ) {

        return null;

    }


    const currentRevision =
        Number(
            projectCheck.rows[0]
                .current_plan_revision
        );


    const stagesResult =
        await db.query(
            `
                SELECT
                    id,
                    stage_key,
                    title,
                    description,
                    position,
                    weight,
                    status,
                    acceptance_criteria,
                    started_at,
                    completed_at,
                    created_at,
                    updated_at

                FROM stages

                WHERE
                    project_id = $1::uuid
                    AND
                    revision = $2

                ORDER BY
                    position,
                    created_at
            `,
            [
                projectId,
                currentRevision
            ]
        );


    const worksResult =
        await db.query(
            `
                SELECT
                    w.id,
                    w.stage_id,
                    w.work_key,
                    w.title,
                    w.description,
                    w.position,
                    w.weight,
                    w.status,
                    w.acceptance_criteria,
                    w.dependencies,
                    w.started_at,
                    w.completed_at,
                    w.created_at,
                    w.updated_at

                FROM works w

                INNER JOIN stages s
                    ON
                        s.id = w.stage_id

                WHERE
                    s.project_id = $1::uuid
                    AND
                    s.revision = $2

                ORDER BY
                    s.position,
                    w.position,
                    w.created_at
            `,
            [
                projectId,
                currentRevision
            ]
        );


    const subworksResult =
        await db.query(
            `
                SELECT
                    sw.id,
                    sw.work_id,
                    sw.subwork_key,
                    sw.title,
                    sw.description,
                    sw.position,
                    sw.kind,
                    sw.status,
                    sw.created_at,
                    sw.updated_at

                FROM subworks sw

                INNER JOIN works w
                    ON
                        w.id = sw.work_id

                INNER JOIN stages s
                    ON
                        s.id = w.stage_id

                WHERE
                    s.project_id = $1::uuid
                    AND
                    s.revision = $2

                ORDER BY
                    s.position,
                    w.position,
                    sw.position,
                    sw.created_at
            `,
            [
                projectId,
                currentRevision
            ]
        );


    const revisionsResult =
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
            `,
            [
                projectId
            ]
        );


    const eventsResult =
        await db.query(
            `
                SELECT
                    id,
                    event_type,
                    severity,
                    actor_type,
                    actor_id,
                    message,
                    data,
                    created_at

                FROM events

                WHERE
                    project_id = $1::uuid

                ORDER BY
                    id DESC

                LIMIT 40
            `,
            [
                projectId
            ]
        );


    const totalWeight =
        worksResult.rows.reduce(
            (
                total,
                work
            ) => {

                return (
                    total
                    +
                    numberValue(
                        work.weight
                    )
                );

            },
            0
        );


    const completedWeight =
        worksResult.rows.reduce(
            (
                total,
                work
            ) => {

                if (
                    work.status
                    !==
                    'completed'
                ) {

                    return total;

                }


                return (
                    total
                    +
                    numberValue(
                        work.weight
                    )
                );

            },
            0
        );


    const verifiedProgress =
        totalWeight > 0

            ? Number(
                (
                    (
                        completedWeight
                        /
                        totalWeight
                    )
                    *
                    100
                ).toFixed(
                    1
                )
            )

            : 0;


    const subworksByWork =
        new Map<
            string,
            typeof subworksResult.rows
        >();


    for (
        const subwork
        of subworksResult.rows
    ) {

        const key =
            String(
                subwork.work_id
            );


        const list =
            subworksByWork.get(
                key
            )
            ??
            [];


        list.push(
            subwork
        );


        subworksByWork.set(
            key,
            list
        );

    }


    const worksByStage =
        new Map<
            string,
            Array<
                Record<
                    string,
                    unknown
                >
            >
        >();


    for (
        const work
        of worksResult.rows
    ) {

        const stageId =
            String(
                work.stage_id
            );


        const list =
            worksByStage.get(
                stageId
            )
            ??
            [];


        list.push({

            ...work,

            weight:
                numberValue(
                    work.weight
                ),

            subworks:
                subworksByWork.get(
                    String(
                        work.id
                    )
                )
                ??
                []

        });


        worksByStage.set(
            stageId,
            list
        );

    }


    const stages =
        stagesResult.rows.map(
            stage => ({

                ...stage,

                weight:
                    numberValue(
                        stage.weight
                    ),

                works:
                    worksByStage.get(
                        String(
                            stage.id
                        )
                    )
                    ??
                    []

            })
        );


    return {

        currentRevision,

        verifiedProgress,

        totals: {

            stages:
                stagesResult.rowCount
                ??
                0,

            works:
                worksResult.rowCount
                ??
                0,

            completedWorks:
                worksResult.rows
                    .filter(
                        work =>
                            work.status
                            ===
                            'completed'
                    )
                    .length,

            subworks:
                subworksResult.rowCount
                ??
                0,

            revisions:
                revisionsResult.rowCount
                ??
                0,

            events:
                eventsResult.rowCount
                ??
                0

        },

        stages,

        revisions:
            revisionsResult.rows,

        events:
            eventsResult.rows

    };

}

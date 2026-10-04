BEGIN;

WITH targets AS (
    SELECT p.id AS project_id, MAX(ppv.version)::integer AS target_revision
    FROM projects p
    INNER JOIN project_plan_versions ppv
        ON ppv.project_id = p.id
       AND ppv.status = 'approved'
    INNER JOIN stages s
        ON s.project_id = p.id
       AND s.revision = ppv.version
    WHERE p.deleted_at IS NULL
    GROUP BY p.id, p.current_plan_revision
    HAVING p.current_plan_revision IS DISTINCT FROM MAX(ppv.version)::integer
), repaired AS (
    UPDATE projects project
    SET current_plan_revision = targets.target_revision,
        settings = COALESCE(project.settings, '{}'::jsonb)
            || jsonb_build_object(
                'planningStatus', 'plan_tree_ready',
                'latestPlanVersion', targets.target_revision,
                'approvedPlanVersion', targets.target_revision
            ),
        updated_at = now()
    FROM targets
    WHERE project.id = targets.project_id
    RETURNING project.id, targets.target_revision
), recorded AS (
    INSERT INTO events (
        project_id, entity_type, entity_id, event_type, severity,
        actor_type, actor_id, message, data
    )
    SELECT
        repaired.id, 'project', repaired.id::text,
        'project.plan_tree.visibility_repaired', 'info',
        'system', 'migration-020',
        'نسخه جاری پروژه با PLAN TREE ساخته‌شده همگام شد و Stage/Workها قابل نمایش شدند.',
        jsonb_build_object('currentPlanRevision', repaired.target_revision)
    FROM repaired
    RETURNING project_id
)
SELECT
    (SELECT count(*) FROM repaired) AS repaired_projects,
    (SELECT count(*) FROM recorded) AS recorded_events;

INSERT INTO schema_migrations (version)
VALUES ('020_plan_tree_visibility')
ON CONFLICT (version) DO NOTHING;

COMMIT;

BEGIN;

ALTER TABLE prompt_requests
    ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
    ADD COLUMN IF NOT EXISTS deleted_by text;

CREATE INDEX IF NOT EXISTS idx_prompt_requests_project_visible
    ON prompt_requests(project_id, created_at DESC)
    WHERE deleted_at IS NULL;

CREATE TEMP TABLE stagepilot_duplicate_work_requests
ON COMMIT DROP
AS
WITH ranked AS (
    SELECT pr.id,
           row_number() OVER (
               PARTITION BY pr.project_id, pr.work_id
               ORDER BY pr.created_at DESC, pr.id DESC
           ) AS position
    FROM prompt_requests pr
    WHERE pr.request_type = 'work_execution'
      AND pr.status IN ('processing', 'sent', 'waiting_response')
      AND pr.work_id IS NOT NULL
), duplicates AS (
    UPDATE prompt_requests pr
    SET status = 'cancelled',
        completed_at = COALESCE(pr.completed_at, now()),
        last_error = 'SUPERSEDED_DUPLICATE_WORK_REQUEST',
        context_json = COALESCE(pr.context_json, '{}'::jsonb)
            || jsonb_build_object(
                'transportStage', 'cancelled',
                'transportUpdatedAt', now()::text,
                'cancelReason', 'superseded_duplicate_work_request'
            )
    FROM ranked
    WHERE pr.id = ranked.id
      AND ranked.position > 1
    RETURNING pr.id
)
SELECT id
FROM duplicates;

SELECT count(*) AS cancelled_duplicate_work_requests
FROM stagepilot_duplicate_work_requests;

CREATE TEMP TABLE stagepilot_interrupted_work_requests
ON COMMIT DROP
AS
WITH interrupted AS (
    UPDATE prompt_requests pr
    SET status = 'blocked',
        completed_at = COALESCE(pr.completed_at, now()),
        last_error = 'DEPLOYMENT_INTERRUPTED_WORK_REQUEST_REVIEW_REQUIRED',
        context_json = COALESCE(pr.context_json, '{}'::jsonb)
            || jsonb_build_object(
                'transportStage', 'blocked',
                'transportUpdatedAt', now()::text,
                'cancelReason', 'deployment_interrupted_work_request'
            )
    WHERE pr.request_type = 'work_execution'
      AND pr.status IN ('processing', 'sent', 'waiting_response')
    RETURNING pr.id, pr.project_id, pr.work_id
)
SELECT id, project_id, work_id
FROM interrupted;

SELECT count(*) AS blocked_interrupted_work_requests
FROM stagepilot_interrupted_work_requests;

UPDATE project_automation_attempts paa
SET status = 'blocked',
    error_text = affected.error_text,
    completed_at = COALESCE(paa.completed_at, now())
FROM (
    SELECT duplicate_request.id,
           'SUPERSEDED_DUPLICATE_WORK_REQUEST'::text AS error_text
    FROM stagepilot_duplicate_work_requests duplicate_request
    UNION ALL
    SELECT interrupted.id,
           'DEPLOYMENT_INTERRUPTED_WORK_REQUEST_REVIEW_REQUIRED'::text AS error_text
    FROM stagepilot_interrupted_work_requests interrupted
) affected
WHERE paa.prompt_request_id = affected.id
  AND paa.status NOT IN ('completed', 'failed', 'blocked');

UPDATE runs run
SET status = 'blocked', finished_at = COALESCE(run.finished_at, now()),
    result_json = COALESCE(run.result_json, '{}'::jsonb)
        || jsonb_build_object('error', affected.error_text)
FROM project_automation_attempts paa,
     (
         SELECT duplicate_request.id,
                'SUPERSEDED_DUPLICATE_WORK_REQUEST'::text AS error_text
         FROM stagepilot_duplicate_work_requests duplicate_request
         UNION ALL
         SELECT interrupted.id,
                'DEPLOYMENT_INTERRUPTED_WORK_REQUEST_REVIEW_REQUIRED'::text AS error_text
         FROM stagepilot_interrupted_work_requests interrupted
     ) affected
WHERE run.project_id = paa.project_id
  AND run.work_id = paa.work_id
  AND run.run_key = paa.run_key
  AND paa.prompt_request_id = affected.id
  AND run.status = 'running';

UPDATE works work
SET status = 'paused', updated_at = now(),
    metadata = metadata || jsonb_build_object(
        'pausedBy', 'deployment',
        'pauseReason', 'interrupted_work_request_requires_review'
    )
WHERE work.id IN (
    SELECT DISTINCT interrupted.work_id
    FROM stagepilot_interrupted_work_requests interrupted
    WHERE interrupted.work_id IS NOT NULL
)
  AND work.status = 'running';

UPDATE project_automation_state state
SET status = 'paused', lease_owner = NULL, lease_expires_at = NULL,
    last_error = 'DEPLOYMENT_INTERRUPTED_WORK_REQUEST_REVIEW_REQUIRED',
    metadata = metadata || jsonb_build_object(
        'lastAction', 'deployment_safe_pause',
        'safeStopRequestedAt', now()::text
    ),
    updated_at = now()
WHERE EXISTS (
    SELECT 1
    FROM stagepilot_interrupted_work_requests interrupted
    WHERE interrupted.project_id = state.project_id
);

INSERT INTO schema_migrations (version)
VALUES ('022_work_request_control')
ON CONFLICT (version) DO NOTHING;

COMMIT;

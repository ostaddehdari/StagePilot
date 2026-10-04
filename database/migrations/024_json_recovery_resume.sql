BEGIN;

CREATE TEMP TABLE stagepilot_json_recovery_resume
ON COMMIT DROP
AS
SELECT DISTINCT ON (state.project_id)
       state.project_id,
       attempt.stage_id,
       attempt.work_id,
       attempt.attempt AS failed_attempt
FROM project_automation_state state
JOIN project_automation_attempts attempt
  ON attempt.project_id = state.project_id
JOIN works work
  ON work.id = attempt.work_id
WHERE NOT EXISTS (
          SELECT 1
          FROM schema_migrations
          WHERE version = '024_json_recovery_resume'
      )
  AND state.status = 'paused'
  AND state.metadata->>'lastAction' = 'invalid_json_response_requeued'
  AND attempt.status = 'failed'
  AND attempt.error_text LIKE 'INVALID_JSON_RESPONSE%'
  AND work.status <> 'completed'
  AND attempt.id = (
      SELECT latest.id
      FROM project_automation_attempts latest
      WHERE latest.work_id = attempt.work_id
      ORDER BY latest.attempt DESC, latest.created_at DESC, latest.id DESC
      LIMIT 1
  )
ORDER BY state.project_id, attempt.created_at DESC, attempt.id DESC;

UPDATE works work
SET status = 'pending',
    completed_at = NULL,
    updated_at = now(),
    metadata = COALESCE(work.metadata, '{}'::jsonb)
        || jsonb_build_object(
            'jsonResponseRecoveryResumedAt', now()::text,
            'jsonResponseRecoveryReason', 'stale_deployment_pause_removed'
        )
FROM stagepilot_json_recovery_resume recovery
WHERE work.id = recovery.work_id
  AND work.status <> 'completed';

UPDATE project_automation_state state
SET status = 'queued',
    current_stage_id = NULL,
    current_work_id = NULL,
    max_work_attempts = LEAST(
        20,
        GREATEST(
            state.max_work_attempts,
            recovery.failed_attempt + 2
        )
    ),
    lease_owner = NULL,
    lease_expires_at = NULL,
    last_error = NULL,
    completed_at = NULL,
    metadata = (
        COALESCE(state.metadata, '{}'::jsonb)
        - 'selectedStageId'
    ) || jsonb_build_object(
        'selectedWorkId', recovery.work_id::text,
        'lastAction', 'invalid_json_response_resumed',
        'jsonResponseRecoveryResumedAt', now()::text
    ),
    updated_at = now()
FROM stagepilot_json_recovery_resume recovery
WHERE state.project_id = recovery.project_id;

INSERT INTO events (
    project_id,
    stage_id,
    work_id,
    entity_type,
    entity_id,
    event_type,
    severity,
    actor_type,
    actor_id,
    message,
    data
)
SELECT recovery.project_id,
       recovery.stage_id,
       recovery.work_id,
       'work',
       recovery.work_id::text,
       'work.invalid_json_response.resumed',
       'info',
       'system',
       'deployment',
       'Recovered Work resumed after removing a stale deployment pause.',
       jsonb_build_object(
           'failedAttempt', recovery.failed_attempt,
           'reason', 'STALE_DEPLOYMENT_PAUSE',
           'queued', true
       )
FROM stagepilot_json_recovery_resume recovery;

SELECT count(*) AS resumed_json_recovery_works
FROM stagepilot_json_recovery_resume;

INSERT INTO schema_migrations (version)
VALUES ('024_json_recovery_resume')
ON CONFLICT (version) DO NOTHING;

COMMIT;

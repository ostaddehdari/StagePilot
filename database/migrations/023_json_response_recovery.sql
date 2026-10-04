BEGIN;

CREATE TEMP TABLE stagepilot_json_response_recovery
ON COMMIT DROP
AS
SELECT DISTINCT ON (attempt.project_id)
       attempt.project_id,
       attempt.stage_id,
       attempt.work_id,
       attempt.attempt AS failed_attempt
FROM project_automation_attempts attempt
JOIN works work
  ON work.id = attempt.work_id
WHERE NOT EXISTS (
          SELECT 1
          FROM schema_migrations
          WHERE version = '023_json_response_recovery'
      )
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
ORDER BY attempt.project_id, attempt.created_at DESC, attempt.id DESC;

UPDATE works work
SET status = 'pending',
    completed_at = NULL,
    updated_at = now(),
    metadata = COALESCE(work.metadata, '{}'::jsonb)
        || jsonb_build_object(
            'jsonResponseRecoveryQueuedAt', now()::text,
            'jsonResponseRecoveryReason', 'parser_hardened_after_invalid_json'
        )
FROM stagepilot_json_response_recovery recovery
WHERE work.id = recovery.work_id
  AND work.status <> 'completed';

UPDATE stages stage
SET status = CASE
        WHEN stage.status = 'completed' THEN stage.status
        ELSE 'running'
    END,
    completed_at = CASE
        WHEN stage.status = 'completed' THEN stage.completed_at
        ELSE NULL
    END,
    updated_at = now()
FROM stagepilot_json_response_recovery recovery
WHERE stage.id = recovery.stage_id;

UPDATE project_automation_state state
SET status = CASE
        WHEN state.status = 'paused' THEN 'paused'
        ELSE 'queued'
    END,
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
    metadata = (
        COALESCE(state.metadata, '{}'::jsonb)
        - 'selectedStageId'
    ) || jsonb_build_object(
        'selectedWorkId', recovery.work_id::text,
        'lastAction', 'invalid_json_response_requeued',
        'jsonResponseRecoveryQueuedAt', now()::text
    ),
    updated_at = now()
FROM stagepilot_json_response_recovery recovery
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
       'work.invalid_json_response.requeued',
       'warning',
       'system',
       'deployment',
       'Work requeued after resilient JSON response parser deployment.',
       jsonb_build_object(
           'failedAttempt', recovery.failed_attempt,
           'reason', 'INVALID_JSON_RESPONSE',
           'parserRecovery', true
       )
FROM stagepilot_json_response_recovery recovery;

SELECT count(*) AS requeued_invalid_json_works
FROM stagepilot_json_response_recovery;

INSERT INTO schema_migrations (version)
VALUES ('023_json_response_recovery')
ON CONFLICT (version) DO NOTHING;

COMMIT;

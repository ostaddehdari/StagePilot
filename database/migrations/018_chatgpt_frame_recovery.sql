BEGIN;

WITH recoverable AS (
    SELECT failed.id
    FROM prompt_requests failed
    WHERE failed.request_type IN (
        'project_plan', 'project_proposal', 'project_plan_tree'
    )
      AND failed.status = 'failed'
      AND failed.sent_at IS NOT NULL
      AND (
          failed.last_error ILIKE '%detached Frame%'
          OR failed.last_error ILIKE '%Execution context was destroyed%'
          OR failed.last_error ILIKE '%Cannot find context with specified id%'
      )
      AND NOT EXISTS (
          SELECT 1
          FROM prompt_requests active
          WHERE active.project_id = failed.project_id
            AND active.id <> failed.id
            AND active.request_type IN (
                'project_plan', 'project_proposal', 'project_plan_tree'
            )
            AND active.status IN (
                'created', 'retry', 'processing', 'sent', 'waiting_response'
            )
      )
), recovered AS (
    UPDATE prompt_requests request
    SET status = 'retry',
        completed_at = NULL,
        next_attempt_at = now(),
        claimed_at = NULL,
        claimed_by = NULL,
        last_error = 'RESPONSE_RECOVERY_QUEUED_WITHOUT_RESEND',
        context_json = COALESCE(request.context_json, '{}'::jsonb)
            || jsonb_build_object(
                'transportStage', 'response_recovery',
                'transportUpdatedAt', now()::text,
                'recoveryOnly', true,
                'resendBlocked', true
            )
    FROM recoverable
    WHERE request.id = recoverable.id
    RETURNING request.id, request.project_id
)
SELECT count(*) AS queued_detached_frame_recoveries
FROM recovered;

INSERT INTO schema_migrations (version)
VALUES ('018_chatgpt_frame_recovery')
ON CONFLICT (version) DO NOTHING;

COMMIT;

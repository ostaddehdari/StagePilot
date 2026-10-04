BEGIN;

WITH recoverable AS (
    SELECT DISTINCT ON (failed.project_id)
           failed.id,
           failed.project_id
    FROM prompt_requests failed
    WHERE failed.request_type IN (
        'project_plan', 'project_proposal', 'project_plan_tree'
    )
      AND failed.status = 'failed'
      AND failed.last_error ILIKE '%CHATGPT_INTERVENTION_REQUIRED:VISIBLE_BROWSER_ACTIVE%'
      AND failed.sent_at IS NULL
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
    ORDER BY failed.project_id, failed.created_at DESC, failed.id DESC
), recovered AS (
    UPDATE prompt_requests request
    SET status = 'retry',
        completed_at = NULL,
        next_attempt_at = now(),
        claimed_at = NULL,
        claimed_by = NULL,
        last_error = 'VISIBLE_BROWSER_AUTOMATIC_HANDOFF_QUEUED',
        context_json = COALESCE(request.context_json, '{}'::jsonb)
            || jsonb_build_object(
                'transportStage', 'visible_handoff_queued',
                'transportUpdatedAt', now()::text,
                'recoveryOnly', false,
                'resendBlocked', false
            )
    FROM recoverable
    WHERE request.id = recoverable.id
    RETURNING request.id, request.project_id
)
SELECT count(*) AS queued_visible_browser_handoffs
FROM recovered;

INSERT INTO schema_migrations (version)
VALUES ('021_visible_browser_handoff')
ON CONFLICT (version) DO NOTHING;

COMMIT;

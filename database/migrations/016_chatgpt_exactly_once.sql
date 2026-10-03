BEGIN;

WITH ranked_active_requests AS (
    SELECT id,
           row_number() OVER (
               PARTITION BY project_id
               ORDER BY
                   CASE status
                       WHEN 'waiting_response' THEN 1
                       WHEN 'sent' THEN 2
                       WHEN 'processing' THEN 3
                       WHEN 'retry' THEN 4
                       ELSE 5
                   END,
                   created_at DESC,
                   id DESC
           ) AS active_rank
    FROM prompt_requests
    WHERE request_type = 'project_plan'
      AND status IN (
          'created', 'retry', 'processing',
          'sent', 'waiting_response'
      )
), closed_duplicates AS (
    UPDATE prompt_requests pr
    SET status = 'failed',
        completed_at = COALESCE(pr.completed_at, now()),
        next_attempt_at = NULL,
        claimed_at = NULL,
        claimed_by = NULL,
        last_error = 'DUPLICATE_ACTIVE_REQUEST_CLOSED_BY_EXACTLY_ONCE_GUARD',
        context_json = COALESCE(pr.context_json, '{}'::jsonb)
            || jsonb_build_object(
                'transportStage', 'failed',
                'transportUpdatedAt', now()::text,
                'automaticRetry', false,
                'duplicateGuard', true
            )
    FROM ranked_active_requests ranked
    WHERE pr.id = ranked.id
      AND ranked.active_rank > 1
    RETURNING pr.id
)
SELECT count(*) AS closed_duplicate_active_requests
FROM closed_duplicates;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_prompt_requests_active_project_plan
    ON prompt_requests(project_id)
    WHERE request_type = 'project_plan'
      AND status IN (
          'created', 'retry', 'processing',
          'sent', 'waiting_response'
      );

INSERT INTO schema_migrations (version)
VALUES ('016_chatgpt_exactly_once')
ON CONFLICT (version) DO NOTHING;

COMMIT;

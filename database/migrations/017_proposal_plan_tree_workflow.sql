BEGIN;

ALTER TABLE project_planning_messages
    ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
    ADD COLUMN IF NOT EXISTS deleted_by text;

ALTER TABLE project_planning_messages
    DROP CONSTRAINT IF EXISTS project_planning_messages_type_check;

ALTER TABLE project_planning_messages
    ADD CONSTRAINT project_planning_messages_type_check
    CHECK (
        message_type IN (
            'idea',
            'evaluation',
            'technology',
            'proposal',
            'proposal_draft',
            'official_proposal',
            'plan_tree',
            'comment',
            'decision',
            'prompt'
        )
    );

CREATE INDEX IF NOT EXISTS idx_project_planning_messages_visible
    ON project_planning_messages(project_id, created_at)
    WHERE deleted_at IS NULL;

WITH ranked_active_requests AS (
    SELECT id,
           row_number() OVER (
               PARTITION BY project_id
               ORDER BY created_at DESC, id DESC
           ) AS active_rank
    FROM prompt_requests
    WHERE request_type IN (
        'project_plan',
        'project_proposal',
        'project_plan_tree'
    )
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
        last_error = 'DUPLICATE_ACTIVE_PLANNING_WORKFLOW_CLOSED',
        context_json = COALESCE(pr.context_json, '{}'::jsonb)
            || jsonb_build_object(
                'transportStage', 'failed',
                'transportUpdatedAt', now()::text,
                'automaticRetry', false,
                'workflowGuard', true
            )
    FROM ranked_active_requests ranked
    WHERE pr.id = ranked.id
      AND ranked.active_rank > 1
    RETURNING pr.id
)
SELECT count(*) AS closed_duplicate_planning_workflows
FROM closed_duplicates;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_prompt_requests_active_planning_workflow
    ON prompt_requests(project_id)
    WHERE request_type IN (
        'project_plan',
        'project_proposal',
        'project_plan_tree'
    )
      AND status IN (
          'created', 'retry', 'processing',
          'sent', 'waiting_response'
      );

INSERT INTO schema_migrations (version)
VALUES ('017_proposal_plan_tree_workflow')
ON CONFLICT (version) DO NOTHING;

COMMIT;

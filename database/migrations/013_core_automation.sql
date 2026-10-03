BEGIN;

ALTER TABLE prompt_requests
    ADD COLUMN IF NOT EXISTS claimed_at timestamptz,
    ADD COLUMN IF NOT EXISTS claimed_by text,
    ADD COLUMN IF NOT EXISTS last_error text,
    ADD COLUMN IF NOT EXISTS next_attempt_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_prompt_requests_worker_queue
    ON prompt_requests(status, next_attempt_at, created_at)
    WHERE status IN ('created', 'retry', 'processing', 'sent', 'waiting_response');

CREATE TABLE IF NOT EXISTS project_automation_state (
    project_id uuid PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
    status text NOT NULL DEFAULT 'idle',
    mode text NOT NULL DEFAULT 'automatic',
    current_stage_id uuid REFERENCES stages(id) ON DELETE SET NULL,
    current_work_id uuid REFERENCES works(id) ON DELETE SET NULL,
    cycle_no integer NOT NULL DEFAULT 0,
    max_work_attempts integer NOT NULL DEFAULT 3,
    lease_owner text,
    lease_expires_at timestamptz,
    last_heartbeat_at timestamptz,
    last_error text,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    started_at timestamptz,
    completed_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT project_automation_state_status_check CHECK (status IN (
        'idle', 'queued', 'running', 'waiting_ai', 'executing',
        'testing', 'git_sync', 'paused', 'blocked', 'failed', 'completed'
    )),
    CONSTRAINT project_automation_state_mode_check
        CHECK (mode IN ('automatic', 'approval_required')),
    CONSTRAINT project_automation_state_cycle_check
        CHECK (cycle_no >= 0 AND max_work_attempts BETWEEN 1 AND 20)
);

CREATE INDEX IF NOT EXISTS idx_project_automation_queue
    ON project_automation_state(status, lease_expires_at, updated_at);

CREATE TABLE IF NOT EXISTS project_automation_attempts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    stage_id uuid REFERENCES stages(id) ON DELETE SET NULL,
    work_id uuid REFERENCES works(id) ON DELETE SET NULL,
    prompt_request_id uuid REFERENCES prompt_requests(id) ON DELETE SET NULL,
    prompt_response_id uuid REFERENCES prompt_responses(id) ON DELETE SET NULL,
    attempt integer NOT NULL,
    status text NOT NULL DEFAULT 'created',
    run_key text NOT NULL UNIQUE,
    workspace_path text,
    test_command text,
    commit_sha text,
    result_json jsonb NOT NULL DEFAULT '{}'::jsonb,
    error_text text,
    started_at timestamptz NOT NULL DEFAULT now(),
    completed_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT project_automation_attempts_attempt_check CHECK (attempt >= 1),
    CONSTRAINT project_automation_attempts_status_check CHECK (status IN (
        'created', 'prompting', 'response_received', 'executing', 'testing',
        'committing', 'pushing', 'completed', 'failed', 'blocked'
    ))
);

CREATE INDEX IF NOT EXISTS idx_project_automation_attempts_work
    ON project_automation_attempts(project_id, work_id, attempt DESC);

CREATE TABLE IF NOT EXISTS worker_heartbeats (
    worker_key text PRIMARY KEY,
    worker_version text NOT NULL,
    status text NOT NULL,
    current_job jsonb NOT NULL DEFAULT '{}'::jsonb,
    last_error text,
    started_at timestamptz NOT NULL DEFAULT now(),
    heartbeat_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO schema_migrations (version)
VALUES ('013_core_automation')
ON CONFLICT (version) DO NOTHING;

COMMIT;

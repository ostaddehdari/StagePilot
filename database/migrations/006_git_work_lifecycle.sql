CREATE TABLE IF NOT EXISTS git_work_lifecycles (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    lifecycle_key text NOT NULL UNIQUE,

    project_id uuid NOT NULL
        REFERENCES projects(id)
        ON DELETE CASCADE,

    stage_key text NOT NULL,

    work_key text NOT NULL,

    run_key text,

    repository text NOT NULL,

    workspace_path text NOT NULL,

    remote_name text NOT NULL DEFAULT 'origin',

    branch_name text NOT NULL,

    commit_message text NOT NULL,

    implementation_ref text NOT NULL,

    implementation_verified boolean NOT NULL DEFAULT false,

    tests_verified boolean NOT NULL DEFAULT false,

    workspace_verified boolean NOT NULL DEFAULT false,

    local_commit_sha text,

    remote_commit_sha text,

    state text NOT NULL DEFAULT 'READY_TO_COMMIT',

    commit_created_at timestamptz,

    push_attempted_at timestamptz,

    push_verified_at timestamptz,

    push_attempts integer NOT NULL DEFAULT 0,

    result_json jsonb NOT NULL DEFAULT '{}'::jsonb,

    error_json jsonb NOT NULL DEFAULT '{}'::jsonb,

    created_at timestamptz NOT NULL DEFAULT now(),

    updated_at timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT git_work_lifecycles_state_check
        CHECK (
            state IN (
                'READY_TO_COMMIT',
                'COMMITTED',
                'PUSH_INTENT',
                'GIT_PENDING',
                'PUSHED',
                'VERIFIED',
                'FAILED'
            )
        ),

    CONSTRAINT git_work_lifecycles_branch_check
        CHECK (
            branch_name <> ''
            AND branch_name !~ '[[:space:]]'
        ),

    CONSTRAINT git_work_lifecycles_workspace_check
        CHECK (
            workspace_path LIKE '/%'
            AND workspace_path <> '/'
        ),

    CONSTRAINT git_work_lifecycles_push_attempts_check
        CHECK (
            push_attempts >= 0
        )
);


CREATE INDEX IF NOT EXISTS
    idx_git_work_lifecycles_project
ON git_work_lifecycles(project_id);


CREATE INDEX IF NOT EXISTS
    idx_git_work_lifecycles_state
ON git_work_lifecycles(state);


CREATE INDEX IF NOT EXISTS
    idx_git_work_lifecycles_stage_work
ON git_work_lifecycles(
    project_id,
    stage_key,
    work_key
);


CREATE UNIQUE INDEX IF NOT EXISTS
    idx_git_work_lifecycles_local_commit
ON git_work_lifecycles(
    project_id,
    local_commit_sha
)
WHERE local_commit_sha IS NOT NULL;

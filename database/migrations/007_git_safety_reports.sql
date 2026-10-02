CREATE TABLE IF NOT EXISTS git_safety_reports (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    report_key text NOT NULL UNIQUE,

    project_id uuid NOT NULL
        REFERENCES projects(id)
        ON DELETE CASCADE,

    lifecycle_id uuid
        REFERENCES git_work_lifecycles(id)
        ON DELETE SET NULL,

    issue_type text NOT NULL,

    status text NOT NULL,

    decision_required boolean NOT NULL DEFAULT false,

    preserves_manual_changes boolean NOT NULL DEFAULT true,

    automatic_force_push boolean NOT NULL DEFAULT false,

    untrusted_hooks_disabled boolean NOT NULL DEFAULT true,

    local_evidence jsonb NOT NULL DEFAULT '{}'::jsonb,

    remote_evidence jsonb NOT NULL DEFAULT '{}'::jsonb,

    decision_json jsonb NOT NULL DEFAULT '{}'::jsonb,

    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,

    created_at timestamptz NOT NULL DEFAULT now(),

    updated_at timestamptz NOT NULL DEFAULT now(),

    resolved_at timestamptz,

    CONSTRAINT git_safety_reports_issue_check
        CHECK (
            issue_type IN (
                'DIRTY_TREE',
                'MERGE_CONFLICT',
                'REMOTE_AHEAD',
                'LOCAL_AHEAD',
                'REMOTE_DIVERGED',
                'PERMISSION_DENIED',
                'PROTECTED_BRANCH',
                'NETWORK_FAILURE',
                'REMOTE_REJECTED',
                'HOOK_CONFIGURATION',
                'SAFE'
            )
        ),

    CONSTRAINT git_safety_reports_status_check
        CHECK (
            status IN (
                'blocked',
                'decision_required',
                'pending',
                'informational',
                'resolved'
            )
        ),

    CONSTRAINT git_safety_reports_no_force_push_check
        CHECK (
            automatic_force_push=false
        )
);


CREATE INDEX IF NOT EXISTS
    idx_git_safety_reports_project
ON git_safety_reports(project_id);


CREATE INDEX IF NOT EXISTS
    idx_git_safety_reports_lifecycle
ON git_safety_reports(lifecycle_id);


CREATE INDEX IF NOT EXISTS
    idx_git_safety_reports_status
ON git_safety_reports(status);


CREATE INDEX IF NOT EXISTS
    idx_git_safety_reports_issue
ON git_safety_reports(issue_type);

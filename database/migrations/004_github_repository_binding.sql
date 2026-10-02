CREATE TABLE IF NOT EXISTS github_repository_requests (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    request_key text NOT NULL UNIQUE,

    project_id uuid NOT NULL
        REFERENCES projects(id)
        ON DELETE CASCADE,

    access_profile_id uuid NOT NULL
        REFERENCES github_access_profiles(id)
        ON DELETE RESTRICT,

    mode text NOT NULL,

    owner_login text NOT NULL,

    repository_name text NOT NULL,

    visibility text NOT NULL DEFAULT 'private',

    default_branch text NOT NULL DEFAULT 'main',

    request_fingerprint text NOT NULL,

    status text NOT NULL DEFAULT 'draft',

    approved_at timestamptz,

    execution_started_at timestamptz,

    completed_at timestamptz,

    github_repository_id bigint,

    result_json jsonb NOT NULL DEFAULT '{}'::jsonb,

    error_json jsonb NOT NULL DEFAULT '{}'::jsonb,

    created_at timestamptz NOT NULL DEFAULT now(),

    updated_at timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT github_repository_requests_mode_check
        CHECK (
            mode IN (
                'create',
                'attach'
            )
        ),

    CONSTRAINT github_repository_requests_visibility_check
        CHECK (
            visibility IN (
                'private',
                'public'
            )
        ),

    CONSTRAINT github_repository_requests_status_check
        CHECK (
            status IN (
                'draft',
                'approved',
                'executing',
                'succeeded',
                'failed',
                'uncertain',
                'cancelled'
            )
        )
);


CREATE UNIQUE INDEX IF NOT EXISTS
    idx_github_repository_request_project_active
ON github_repository_requests(project_id)
WHERE status IN (
    'approved',
    'executing',
    'uncertain'
);


CREATE INDEX IF NOT EXISTS
    idx_github_repository_requests_project
ON github_repository_requests(project_id);


CREATE INDEX IF NOT EXISTS
    idx_github_repository_requests_status
ON github_repository_requests(status);


CREATE TABLE IF NOT EXISTS github_project_repositories (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    project_id uuid NOT NULL UNIQUE
        REFERENCES projects(id)
        ON DELETE CASCADE,

    access_profile_id uuid NOT NULL
        REFERENCES github_access_profiles(id)
        ON DELETE RESTRICT,

    source_request_id uuid NOT NULL UNIQUE
        REFERENCES github_repository_requests(id)
        ON DELETE RESTRICT,

    github_repository_id bigint NOT NULL UNIQUE,

    owner_login text NOT NULL,

    repository_name text NOT NULL,

    full_name text NOT NULL UNIQUE,

    html_url text NOT NULL,

    ssh_url text NOT NULL,

    visibility text NOT NULL,

    default_branch text NOT NULL DEFAULT 'main',

    binding_mode text NOT NULL,

    created_by_stagepilot boolean NOT NULL DEFAULT false,

    status text NOT NULL DEFAULT 'ready',

    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,

    created_at timestamptz NOT NULL DEFAULT now(),

    updated_at timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT github_project_repositories_binding_mode_check
        CHECK (
            binding_mode IN (
                'created',
                'attached'
            )
        ),

    CONSTRAINT github_project_repositories_visibility_check
        CHECK (
            visibility IN (
                'private',
                'public'
            )
        ),

    CONSTRAINT github_project_repositories_status_check
        CHECK (
            status IN (
                'ready',
                'disabled',
                'mismatch'
            )
        )
);


CREATE INDEX IF NOT EXISTS
    idx_github_project_repositories_full_name
ON github_project_repositories(full_name);

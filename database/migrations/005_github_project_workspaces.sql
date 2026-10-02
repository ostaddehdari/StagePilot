DO $$
BEGIN

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname =
            'github_project_repositories_id_project_key'
    ) THEN

        ALTER TABLE github_project_repositories
        ADD CONSTRAINT github_project_repositories_id_project_key
        UNIQUE (
            id,
            project_id
        );

    END IF;

END
$$;


CREATE TABLE IF NOT EXISTS github_project_workspaces (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    project_id uuid NOT NULL UNIQUE
        REFERENCES projects(id)
        ON DELETE CASCADE,

    repository_binding_id uuid NOT NULL UNIQUE,

    workspace_path text NOT NULL UNIQUE,

    remote_name text NOT NULL DEFAULT 'origin',

    remote_url text NOT NULL,

    branch_name text NOT NULL DEFAULT 'main',

    status text NOT NULL DEFAULT 'ready',

    verified_head_sha text,

    verified_remote_sha text,

    last_verified_at timestamptz,

    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,

    created_at timestamptz NOT NULL DEFAULT now(),

    updated_at timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT github_project_workspaces_repo_project_fk
        FOREIGN KEY (
            repository_binding_id,
            project_id
        )
        REFERENCES github_project_repositories (
            id,
            project_id
        )
        ON DELETE CASCADE,

    CONSTRAINT github_project_workspaces_path_check
        CHECK (
            workspace_path LIKE '/%'
            AND workspace_path <> '/'
        ),

    CONSTRAINT github_project_workspaces_remote_name_check
        CHECK (
            remote_name ~ '^[A-Za-z0-9._-]+$'
        ),

    CONSTRAINT github_project_workspaces_remote_url_check
        CHECK (
            remote_url <> ''
            AND remote_url !~ '[[:space:]]'
        ),

    CONSTRAINT github_project_workspaces_branch_check
        CHECK (
            branch_name <> ''
            AND branch_name !~ '[[:space:]]'
        ),

    CONSTRAINT github_project_workspaces_status_check
        CHECK (
            status IN (
                'ready',
                'mismatch',
                'disabled'
            )
        )
);


CREATE INDEX IF NOT EXISTS
    idx_github_project_workspaces_repository
ON github_project_workspaces(
    repository_binding_id
);


CREATE INDEX IF NOT EXISTS
    idx_github_project_workspaces_status
ON github_project_workspaces(
    status
);

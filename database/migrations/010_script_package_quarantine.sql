DO $$
BEGIN

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname='script_packages_id_project_key'
    ) THEN

        ALTER TABLE script_packages
        ADD CONSTRAINT script_packages_id_project_key
        UNIQUE (
            id,
            project_id
        );

    END IF;

END
$$;


CREATE TABLE IF NOT EXISTS script_package_quarantines (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    package_id uuid NOT NULL UNIQUE,

    project_id uuid NOT NULL,

    manifest_sha256 text NOT NULL,

    quarantine_root text NOT NULL UNIQUE,

    server_key text NOT NULL,

    workspace_path text NOT NULL,

    status text NOT NULL DEFAULT 'quarantined',

    all_files_present boolean NOT NULL DEFAULT false,

    syntax_valid boolean NOT NULL DEFAULT false,

    integrity_valid boolean NOT NULL DEFAULT false,

    validation_json jsonb NOT NULL DEFAULT '{}'::jsonb,

    error_json jsonb NOT NULL DEFAULT '{}'::jsonb,

    created_at timestamptz NOT NULL DEFAULT now(),

    validated_at timestamptz,

    updated_at timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT script_package_quarantines_package_project_fk
        FOREIGN KEY (
            package_id,
            project_id
        )
        REFERENCES script_packages (
            id,
            project_id
        )
        ON DELETE CASCADE,

    CONSTRAINT script_package_quarantines_manifest_hash_check
        CHECK (
            manifest_sha256 ~ '^[0-9a-f]{64}$'
        ),

    CONSTRAINT script_package_quarantines_root_check
        CHECK (
            quarantine_root LIKE '/%'
            AND quarantine_root <> '/'
        ),

    CONSTRAINT script_package_quarantines_workspace_check
        CHECK (
            workspace_path LIKE '/%'
            AND workspace_path <> '/'
        ),

    CONSTRAINT script_package_quarantines_status_check
        CHECK (
            status IN (
                'quarantined',
                'validated',
                'approved',
                'rejected',
                'invalidated'
            )
        ),

    CONSTRAINT script_package_quarantines_id_package_key
        UNIQUE (
            id,
            package_id
        )
);


CREATE TABLE IF NOT EXISTS script_package_approvals (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    approval_key text NOT NULL UNIQUE,

    quarantine_id uuid NOT NULL,

    package_id uuid NOT NULL,

    manifest_sha256 text NOT NULL,

    server_key text NOT NULL,

    workspace_path text NOT NULL,

    binding_sha256 text NOT NULL,

    status text NOT NULL DEFAULT 'approved',

    approval_json jsonb NOT NULL DEFAULT '{}'::jsonb,

    approved_at timestamptz NOT NULL DEFAULT now(),

    revoked_at timestamptz,

    consumed_at timestamptz,

    created_at timestamptz NOT NULL DEFAULT now(),

    updated_at timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT script_package_approvals_quarantine_package_fk
        FOREIGN KEY (
            quarantine_id,
            package_id
        )
        REFERENCES script_package_quarantines (
            id,
            package_id
        )
        ON DELETE CASCADE,

    CONSTRAINT script_package_approvals_manifest_hash_check
        CHECK (
            manifest_sha256 ~ '^[0-9a-f]{64}$'
        ),

    CONSTRAINT script_package_approvals_binding_hash_check
        CHECK (
            binding_sha256 ~ '^[0-9a-f]{64}$'
        ),

    CONSTRAINT script_package_approvals_workspace_check
        CHECK (
            workspace_path LIKE '/%'
            AND workspace_path <> '/'
        ),

    CONSTRAINT script_package_approvals_status_check
        CHECK (
            status IN (
                'approved',
                'revoked',
                'consumed',
                'invalidated'
            )
        )
);


CREATE UNIQUE INDEX IF NOT EXISTS
    idx_script_package_approvals_active_quarantine
ON script_package_approvals(quarantine_id)
WHERE status='approved';


CREATE INDEX IF NOT EXISTS
    idx_script_package_quarantines_project
ON script_package_quarantines(project_id);


CREATE INDEX IF NOT EXISTS
    idx_script_package_quarantines_status
ON script_package_quarantines(status);


CREATE INDEX IF NOT EXISTS
    idx_script_package_approvals_package
ON script_package_approvals(package_id);


CREATE INDEX IF NOT EXISTS
    idx_script_package_approvals_status
ON script_package_approvals(status);

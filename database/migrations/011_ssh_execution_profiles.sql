CREATE TABLE IF NOT EXISTS ssh_execution_profiles (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    profile_key text NOT NULL UNIQUE,

    project_id uuid NOT NULL
        REFERENCES projects(id)
        ON DELETE CASCADE,

    server_key text NOT NULL,

    host_label text NOT NULL,

    hostname text NOT NULL,

    port integer NOT NULL,

    username text NOT NULL,

    host_key_type text NOT NULL DEFAULT 'ssh-ed25519',

    host_key_fingerprint text NOT NULL,

    known_hosts_ref text NOT NULL,

    identity_ref text NOT NULL,

    allowed_workspace_root text NOT NULL,

    expected_branch text NOT NULL,

    resource_limits jsonb NOT NULL DEFAULT '{}'::jsonb,

    status text NOT NULL DEFAULT 'needs_verification',

    verification_json jsonb NOT NULL DEFAULT '{}'::jsonb,

    verified_at timestamptz,

    created_at timestamptz NOT NULL DEFAULT now(),

    updated_at timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT ssh_execution_profiles_port_check
        CHECK (
            port BETWEEN 1 AND 65535
        ),

    CONSTRAINT ssh_execution_profiles_known_hosts_ref_check
        CHECK (
            known_hosts_ref LIKE 'file://%'
        ),

    CONSTRAINT ssh_execution_profiles_identity_ref_check
        CHECK (
            identity_ref LIKE 'file://%'
        ),

    CONSTRAINT ssh_execution_profiles_workspace_check
        CHECK (
            allowed_workspace_root LIKE '/%'
            AND allowed_workspace_root <> '/'
        ),

    CONSTRAINT ssh_execution_profiles_branch_check
        CHECK (
            expected_branch <> ''
            AND expected_branch !~ '[[:space:]]'
        ),

    CONSTRAINT ssh_execution_profiles_fingerprint_check
        CHECK (
            host_key_fingerprint ~ '^SHA256:[A-Za-z0-9+/=_-]{16,}$'
        ),

    CONSTRAINT ssh_execution_profiles_status_check
        CHECK (
            status IN (
                'needs_verification',
                'verified',
                'disabled',
                'invalid'
            )
        )
);


CREATE TABLE IF NOT EXISTS ssh_preflight_receipts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    receipt_key text NOT NULL UNIQUE,

    project_id uuid NOT NULL
        REFERENCES projects(id)
        ON DELETE CASCADE,

    profile_id uuid NOT NULL
        REFERENCES ssh_execution_profiles(id)
        ON DELETE CASCADE,

    workspace_path text NOT NULL,

    expected_code_sha text NOT NULL,

    observed_code_sha text,

    expected_branch text NOT NULL,

    observed_branch text,

    status text NOT NULL,

    error_code text,

    host_evidence jsonb NOT NULL DEFAULT '{}'::jsonb,

    code_evidence jsonb NOT NULL DEFAULT '{}'::jsonb,

    resource_evidence jsonb NOT NULL DEFAULT '{}'::jsonb,

    safe_evidence jsonb NOT NULL DEFAULT '{}'::jsonb,

    created_at timestamptz NOT NULL DEFAULT now(),

    completed_at timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT ssh_preflight_receipts_workspace_check
        CHECK (
            workspace_path LIKE '/%'
            AND workspace_path <> '/'
        ),

    CONSTRAINT ssh_preflight_receipts_expected_sha_check
        CHECK (
            expected_code_sha ~ '^[0-9a-f]{40,64}$'
        ),

    CONSTRAINT ssh_preflight_receipts_observed_sha_check
        CHECK (
            observed_code_sha IS NULL
            OR observed_code_sha ~ '^[0-9a-f]{40,64}$'
        ),

    CONSTRAINT ssh_preflight_receipts_status_check
        CHECK (
            status IN (
                'passed',
                'blocked'
            )
        )
);


CREATE INDEX IF NOT EXISTS
    idx_ssh_execution_profiles_project
ON ssh_execution_profiles(project_id);


CREATE INDEX IF NOT EXISTS
    idx_ssh_execution_profiles_status
ON ssh_execution_profiles(status);


CREATE INDEX IF NOT EXISTS
    idx_ssh_preflight_receipts_project
ON ssh_preflight_receipts(project_id);


CREATE INDEX IF NOT EXISTS
    idx_ssh_preflight_receipts_profile
ON ssh_preflight_receipts(profile_id);


CREATE INDEX IF NOT EXISTS
    idx_ssh_preflight_receipts_status
ON ssh_preflight_receipts(status);

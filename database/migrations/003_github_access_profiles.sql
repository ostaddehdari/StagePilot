CREATE TABLE IF NOT EXISTS github_access_profiles (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    profile_key text NOT NULL UNIQUE,

    provider text NOT NULL DEFAULT 'github',

    owner_login text NOT NULL,

    status text NOT NULL DEFAULT 'active',

    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,

    created_at timestamptz NOT NULL DEFAULT now(),

    updated_at timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT github_access_profiles_provider_check
        CHECK (provider = 'github'),

    CONSTRAINT github_access_profiles_status_check
        CHECK (
            status IN (
                'active',
                'disabled',
                'needs_verification'
            )
        )
);


CREATE TABLE IF NOT EXISTS github_credentials (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    profile_id uuid NOT NULL
        REFERENCES github_access_profiles(id)
        ON DELETE CASCADE,

    purpose text NOT NULL,

    credential_type text NOT NULL,

    secret_ref text NOT NULL,

    status text NOT NULL DEFAULT 'unconfigured',

    capabilities jsonb NOT NULL DEFAULT '{}'::jsonb,

    verification jsonb NOT NULL DEFAULT '{}'::jsonb,

    verified_at timestamptz,

    created_at timestamptz NOT NULL DEFAULT now(),

    updated_at timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT github_credentials_profile_purpose_key
        UNIQUE (
            profile_id,
            purpose
        ),

    CONSTRAINT github_credentials_purpose_check
        CHECK (
            purpose IN (
                'repository_api',
                'git_transport'
            )
        ),

    CONSTRAINT github_credentials_status_check
        CHECK (
            status IN (
                'unconfigured',
                'configured',
                'verified',
                'invalid',
                'disabled'
            )
        ),

    CONSTRAINT github_credentials_secret_ref_check
        CHECK (
            secret_ref LIKE 'file://%'
        )
);


CREATE INDEX IF NOT EXISTS idx_github_credentials_profile
    ON github_credentials(profile_id);


CREATE INDEX IF NOT EXISTS idx_github_credentials_status
    ON github_credentials(status);


CREATE INDEX IF NOT EXISTS idx_github_access_profiles_owner
    ON github_access_profiles(owner_login);

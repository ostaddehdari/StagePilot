CREATE TABLE IF NOT EXISTS script_packages (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    package_key text NOT NULL UNIQUE,

    project_id uuid NOT NULL
        REFERENCES projects(id)
        ON DELETE CASCADE,

    stage_key text NOT NULL,

    work_key text NOT NULL,

    run_key text NOT NULL,

    program_id text NOT NULL,

    response_type text NOT NULL,

    request_marker text NOT NULL,

    package_status text NOT NULL DEFAULT 'draft',

    manifest_sha256 text,

    validation_json jsonb NOT NULL DEFAULT '{}'::jsonb,

    error_json jsonb NOT NULL DEFAULT '{}'::jsonb,

    created_at timestamptz NOT NULL DEFAULT now(),

    validated_at timestamptz,

    updated_at timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT script_packages_response_type_check
        CHECK (
            response_type IN (
                'script_batch',
                'report_only',
                'decision_required'
            )
        ),

    CONSTRAINT script_packages_status_check
        CHECK (
            package_status IN (
                'draft',
                'validated',
                'ready',
                'blocked',
                'rejected'
            )
        ),

    CONSTRAINT script_packages_manifest_hash_check
        CHECK (
            manifest_sha256 IS NULL
            OR manifest_sha256 ~ '^[0-9a-f]{64}$'
        ),

    CONSTRAINT script_packages_stage_key_check
        CHECK (
            stage_key ~ '^S[0-9]{2,4}$'
        ),

    CONSTRAINT script_packages_work_key_check
        CHECK (
            work_key ~ '^W[0-9]{2,4}([_-][A-Z0-9]+)?$'
        )
);


CREATE TABLE IF NOT EXISTS script_package_files (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    package_id uuid NOT NULL
        REFERENCES script_packages(id)
        ON DELETE CASCADE,

    ordinal integer NOT NULL,

    filename text NOT NULL,

    content_sha256 text NOT NULL,

    dependencies text[] NOT NULL DEFAULT '{}'::text[],

    header_json jsonb NOT NULL DEFAULT '{}'::jsonb,

    file_status text NOT NULL DEFAULT 'valid',

    error_json jsonb NOT NULL DEFAULT '{}'::jsonb,

    created_at timestamptz NOT NULL DEFAULT now(),

    updated_at timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT script_package_files_ordinal_check
        CHECK (
            ordinal >= 1
        ),

    CONSTRAINT script_package_files_name_check
        CHECK (
            filename ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,80}\.sh$'
        ),

    CONSTRAINT script_package_files_hash_check
        CHECK (
            content_sha256 ~ '^[0-9a-f]{64}$'
        ),

    CONSTRAINT script_package_files_status_check
        CHECK (
            file_status IN (
                'valid',
                'ready',
                'blocked',
                'failed'
            )
        ),

    CONSTRAINT script_package_files_package_ordinal_key
        UNIQUE (
            package_id,
            ordinal
        ),

    CONSTRAINT script_package_files_package_filename_key
        UNIQUE (
            package_id,
            filename
        )
);


CREATE INDEX IF NOT EXISTS
    idx_script_packages_project
ON script_packages(project_id);


CREATE INDEX IF NOT EXISTS
    idx_script_packages_stage_work
ON script_packages(
    project_id,
    stage_key,
    work_key
);


CREATE INDEX IF NOT EXISTS
    idx_script_packages_status
ON script_packages(package_status);


CREATE INDEX IF NOT EXISTS
    idx_script_package_files_package
ON script_package_files(package_id);

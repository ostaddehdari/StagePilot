DO $$
BEGIN

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname='script_package_files_id_package_key'
    ) THEN

        ALTER TABLE script_package_files
        ADD CONSTRAINT script_package_files_id_package_key
        UNIQUE (
            id,
            package_id
        );

    END IF;

END
$$;


CREATE TABLE IF NOT EXISTS script_package_file_outcomes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    package_id uuid NOT NULL,

    file_id uuid NOT NULL,

    attempt integer NOT NULL DEFAULT 1,

    outcome text NOT NULL,

    exit_code integer,

    stdout_sha256 text,

    stderr_sha256 text,

    started_at timestamptz,

    completed_at timestamptz NOT NULL DEFAULT now(),

    result_json jsonb NOT NULL DEFAULT '{}'::jsonb,

    created_at timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT script_package_file_outcomes_file_package_fk
        FOREIGN KEY (
            file_id,
            package_id
        )
        REFERENCES script_package_files (
            id,
            package_id
        )
        ON DELETE CASCADE,

    CONSTRAINT script_package_file_outcomes_attempt_check
        CHECK (
            attempt >= 1
        ),

    CONSTRAINT script_package_file_outcomes_status_check
        CHECK (
            outcome IN (
                'success',
                'failed',
                'blocked'
            )
        ),

    CONSTRAINT script_package_file_outcomes_exit_check
        CHECK (
            (
                outcome='blocked'
                AND exit_code IS NULL
                AND started_at IS NULL
            )
            OR
            (
                outcome IN (
                    'success',
                    'failed'
                )
                AND exit_code IS NOT NULL
                AND started_at IS NOT NULL
            )
        ),

    CONSTRAINT script_package_file_outcomes_stdout_hash_check
        CHECK (
            stdout_sha256 IS NULL
            OR stdout_sha256 ~ '^[0-9a-f]{64}$'
        ),

    CONSTRAINT script_package_file_outcomes_stderr_hash_check
        CHECK (
            stderr_sha256 IS NULL
            OR stderr_sha256 ~ '^[0-9a-f]{64}$'
        ),

    CONSTRAINT script_package_file_outcomes_unique_attempt
        UNIQUE (
            package_id,
            file_id,
            attempt
        )
);


CREATE INDEX IF NOT EXISTS
    idx_script_package_file_outcomes_package
ON script_package_file_outcomes(package_id);


CREATE INDEX IF NOT EXISTS
    idx_script_package_file_outcomes_outcome
ON script_package_file_outcomes(outcome);

BEGIN;


CREATE TABLE IF NOT EXISTS schema_migrations (

    version         text PRIMARY KEY,

    applied_at      timestamptz NOT NULL DEFAULT now()

);


CREATE TABLE IF NOT EXISTS chat_accounts (

    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    label           text NOT NULL,

    profile_key     text NOT NULL UNIQUE,

    status          text NOT NULL DEFAULT 'needs_login',

    metadata        jsonb NOT NULL DEFAULT '{}'::jsonb,

    created_at      timestamptz NOT NULL DEFAULT now(),

    updated_at      timestamptz NOT NULL DEFAULT now()

);


CREATE TABLE IF NOT EXISTS projects (

    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    slug                    text NOT NULL UNIQUE,

    name                    text NOT NULL,

    description             text,

    status                  text NOT NULL DEFAULT 'draft',

    current_plan_revision   integer NOT NULL DEFAULT 0,

    selected_chat_account_id uuid REFERENCES chat_accounts(id)
        ON DELETE SET NULL,

    settings                jsonb NOT NULL DEFAULT '{}'::jsonb,

    created_at              timestamptz NOT NULL DEFAULT now(),

    updated_at              timestamptz NOT NULL DEFAULT now()

);


CREATE TABLE IF NOT EXISTS project_revisions (

    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    project_id      uuid NOT NULL REFERENCES projects(id)
        ON DELETE CASCADE,

    revision        integer NOT NULL,

    source          text NOT NULL DEFAULT 'manager',

    request_text    text,

    plan_json       jsonb NOT NULL,

    approved        boolean NOT NULL DEFAULT false,

    approved_at     timestamptz,

    created_at      timestamptz NOT NULL DEFAULT now(),

    UNIQUE(project_id, revision)

);


CREATE TABLE IF NOT EXISTS stages (

    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    project_id          uuid NOT NULL REFERENCES projects(id)
        ON DELETE CASCADE,

    revision            integer NOT NULL,

    stage_key           text NOT NULL,

    title               text NOT NULL,

    description         text,

    position            integer NOT NULL,

    weight              numeric(10,4) NOT NULL DEFAULT 1,

    status              text NOT NULL DEFAULT 'pending',

    acceptance_criteria jsonb NOT NULL DEFAULT '[]'::jsonb,

    metadata            jsonb NOT NULL DEFAULT '{}'::jsonb,

    started_at          timestamptz,

    completed_at        timestamptz,

    created_at          timestamptz NOT NULL DEFAULT now(),

    updated_at          timestamptz NOT NULL DEFAULT now(),

    UNIQUE(project_id, revision, stage_key)

);


CREATE TABLE IF NOT EXISTS works (

    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    stage_id            uuid NOT NULL REFERENCES stages(id)
        ON DELETE CASCADE,

    work_key            text NOT NULL,

    title               text NOT NULL,

    description         text,

    position            integer NOT NULL,

    weight              numeric(10,4) NOT NULL DEFAULT 1,

    status              text NOT NULL DEFAULT 'pending',

    acceptance_criteria jsonb NOT NULL DEFAULT '[]'::jsonb,

    dependencies        jsonb NOT NULL DEFAULT '[]'::jsonb,

    metadata            jsonb NOT NULL DEFAULT '{}'::jsonb,

    started_at          timestamptz,

    completed_at        timestamptz,

    created_at          timestamptz NOT NULL DEFAULT now(),

    updated_at          timestamptz NOT NULL DEFAULT now(),

    UNIQUE(stage_id, work_key)

);


CREATE TABLE IF NOT EXISTS subworks (

    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    work_id         uuid NOT NULL REFERENCES works(id)
        ON DELETE CASCADE,

    subwork_key     text NOT NULL,

    title           text NOT NULL,

    description     text,

    position        integer NOT NULL DEFAULT 0,

    kind            text NOT NULL DEFAULT 'repair',

    status          text NOT NULL DEFAULT 'pending',

    metadata        jsonb NOT NULL DEFAULT '{}'::jsonb,

    created_at      timestamptz NOT NULL DEFAULT now(),

    updated_at      timestamptz NOT NULL DEFAULT now(),

    UNIQUE(work_id, subwork_key)

);


CREATE TABLE IF NOT EXISTS chat_sessions (

    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    chat_account_id uuid NOT NULL REFERENCES chat_accounts(id)
        ON DELETE CASCADE,

    status          text NOT NULL DEFAULT 'unknown',

    browser_mode    text NOT NULL DEFAULT 'headless',

    profile_path    text,

    last_checked_at timestamptz,

    metadata        jsonb NOT NULL DEFAULT '{}'::jsonb,

    created_at      timestamptz NOT NULL DEFAULT now(),

    updated_at      timestamptz NOT NULL DEFAULT now()

);


CREATE TABLE IF NOT EXISTS conversations (

    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    project_id      uuid NOT NULL REFERENCES projects(id)
        ON DELETE CASCADE,

    chat_account_id uuid REFERENCES chat_accounts(id)
        ON DELETE SET NULL,

    external_url    text,

    external_chat_id text,

    status          text NOT NULL DEFAULT 'active',

    sequence_no     integer NOT NULL DEFAULT 1,

    started_reason  text,

    metadata        jsonb NOT NULL DEFAULT '{}'::jsonb,

    created_at      timestamptz NOT NULL DEFAULT now(),

    closed_at       timestamptz,

    UNIQUE(project_id, sequence_no)

);


CREATE TABLE IF NOT EXISTS prompt_templates (

    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    template_key    text NOT NULL,

    version         text NOT NULL,

    name            text NOT NULL,

    category        text NOT NULL,

    body            text NOT NULL,

    response_contract jsonb NOT NULL DEFAULT '{}'::jsonb,

    active          boolean NOT NULL DEFAULT true,

    created_at      timestamptz NOT NULL DEFAULT now(),

    UNIQUE(template_key, version)

);


CREATE TABLE IF NOT EXISTS prompt_requests (

    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    project_id      uuid REFERENCES projects(id)
        ON DELETE CASCADE,

    stage_id        uuid REFERENCES stages(id)
        ON DELETE SET NULL,

    work_id         uuid REFERENCES works(id)
        ON DELETE SET NULL,

    subwork_id      uuid REFERENCES subworks(id)
        ON DELETE SET NULL,

    conversation_id uuid REFERENCES conversations(id)
        ON DELETE SET NULL,

    template_id     uuid REFERENCES prompt_templates(id)
        ON DELETE SET NULL,

    request_key     text NOT NULL UNIQUE,

    request_type    text NOT NULL,

    prompt_text     text NOT NULL,

    context_json    jsonb NOT NULL DEFAULT '{}'::jsonb,

    state_revision  bigint NOT NULL DEFAULT 0,

    status          text NOT NULL DEFAULT 'created',

    send_attempts   integer NOT NULL DEFAULT 0,

    sent_at         timestamptz,

    completed_at    timestamptz,

    created_at      timestamptz NOT NULL DEFAULT now()

);


CREATE TABLE IF NOT EXISTS prompt_responses (

    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    prompt_request_id uuid NOT NULL REFERENCES prompt_requests(id)
        ON DELETE CASCADE,

    response_type   text,

    raw_text        text NOT NULL,

    parsed_json     jsonb,

    extraction_status text NOT NULL DEFAULT 'pending',

    is_complete     boolean NOT NULL DEFAULT false,

    received_at     timestamptz NOT NULL DEFAULT now()

);


CREATE TABLE IF NOT EXISTS script_batches (

    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    prompt_response_id uuid REFERENCES prompt_responses(id)
        ON DELETE SET NULL,

    batch_key       text NOT NULL UNIQUE,

    status          text NOT NULL DEFAULT 'quarantined',

    manifest        jsonb NOT NULL DEFAULT '{}'::jsonb,

    created_at      timestamptz NOT NULL DEFAULT now(),

    approved_at     timestamptz

);


CREATE TABLE IF NOT EXISTS scripts (

    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    batch_id        uuid NOT NULL REFERENCES script_batches(id)
        ON DELETE CASCADE,

    script_key      text NOT NULL,

    filename        text NOT NULL,

    content         text NOT NULL,

    sha256          text NOT NULL,

    position        integer NOT NULL DEFAULT 0,

    capabilities    jsonb NOT NULL DEFAULT '[]'::jsonb,

    status          text NOT NULL DEFAULT 'quarantined',

    metadata        jsonb NOT NULL DEFAULT '{}'::jsonb,

    created_at      timestamptz NOT NULL DEFAULT now(),

    UNIQUE(batch_id, script_key),

    UNIQUE(batch_id, filename)

);


CREATE TABLE IF NOT EXISTS runs (

    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    project_id      uuid REFERENCES projects(id)
        ON DELETE CASCADE,

    stage_id        uuid REFERENCES stages(id)
        ON DELETE SET NULL,

    work_id         uuid REFERENCES works(id)
        ON DELETE SET NULL,

    script_id       uuid REFERENCES scripts(id)
        ON DELETE SET NULL,

    run_key         text NOT NULL UNIQUE,

    attempt         integer NOT NULL DEFAULT 1,

    target_server   text,

    workspace       text,

    status          text NOT NULL DEFAULT 'created',

    exit_code       integer,

    started_at      timestamptz,

    finished_at     timestamptz,

    result_json     jsonb NOT NULL DEFAULT '{}'::jsonb,

    created_at      timestamptz NOT NULL DEFAULT now()

);


CREATE TABLE IF NOT EXISTS run_logs (

    id              bigserial PRIMARY KEY,

    run_id          uuid NOT NULL REFERENCES runs(id)
        ON DELETE CASCADE,

    stream          text NOT NULL,

    sequence_no     bigint NOT NULL,

    chunk           text NOT NULL,

    created_at      timestamptz NOT NULL DEFAULT now(),

    UNIQUE(run_id, stream, sequence_no)

);


CREATE TABLE IF NOT EXISTS tests (

    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    project_id      uuid REFERENCES projects(id)
        ON DELETE CASCADE,

    stage_id        uuid REFERENCES stages(id)
        ON DELETE CASCADE,

    work_id         uuid REFERENCES works(id)
        ON DELETE CASCADE,

    test_key        text NOT NULL,

    title           text NOT NULL,

    kind            text NOT NULL DEFAULT 'work',

    required        boolean NOT NULL DEFAULT true,

    definition      jsonb NOT NULL DEFAULT '{}'::jsonb,

    created_at      timestamptz NOT NULL DEFAULT now()

);


CREATE TABLE IF NOT EXISTS test_results (

    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    test_id         uuid NOT NULL REFERENCES tests(id)
        ON DELETE CASCADE,

    run_id          uuid REFERENCES runs(id)
        ON DELETE SET NULL,

    status          text NOT NULL,

    evidence        jsonb NOT NULL DEFAULT '{}'::jsonb,

    started_at      timestamptz,

    finished_at     timestamptz,

    created_at      timestamptz NOT NULL DEFAULT now()

);


CREATE TABLE IF NOT EXISTS git_operations (

    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    project_id      uuid NOT NULL REFERENCES projects(id)
        ON DELETE CASCADE,

    work_id         uuid REFERENCES works(id)
        ON DELETE SET NULL,

    operation_type  text NOT NULL,

    repository      text,

    branch          text,

    commit_sha      text,

    status          text NOT NULL DEFAULT 'created',

    result_json     jsonb NOT NULL DEFAULT '{}'::jsonb,

    created_at      timestamptz NOT NULL DEFAULT now(),

    completed_at    timestamptz

);


CREATE TABLE IF NOT EXISTS manager_tasks (

    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    project_id      uuid REFERENCES projects(id)
        ON DELETE CASCADE,

    stage_id        uuid REFERENCES stages(id)
        ON DELETE SET NULL,

    work_id         uuid REFERENCES works(id)
        ON DELETE SET NULL,

    task_key        text NOT NULL UNIQUE,

    task_type       text NOT NULL,

    reason          text,

    status          text NOT NULL DEFAULT 'created',

    resume_checkpoint jsonb NOT NULL DEFAULT '{}'::jsonb,

    result_json     jsonb NOT NULL DEFAULT '{}'::jsonb,

    created_at      timestamptz NOT NULL DEFAULT now(),

    completed_at    timestamptz

);


CREATE TABLE IF NOT EXISTS manager_decisions (

    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    manager_task_id uuid REFERENCES manager_tasks(id)
        ON DELETE SET NULL,

    project_id      uuid REFERENCES projects(id)
        ON DELETE CASCADE,

    stage_id        uuid REFERENCES stages(id)
        ON DELETE SET NULL,

    work_id         uuid REFERENCES works(id)
        ON DELETE SET NULL,

    decision_type   text NOT NULL,

    decision        text NOT NULL,

    reason          text,

    evidence_refs   jsonb NOT NULL DEFAULT '[]'::jsonb,

    created_at      timestamptz NOT NULL DEFAULT now()

);


CREATE TABLE IF NOT EXISTS events (

    id              bigserial PRIMARY KEY,

    event_key       uuid NOT NULL DEFAULT gen_random_uuid(),

    project_id      uuid REFERENCES projects(id)
        ON DELETE CASCADE,

    stage_id        uuid REFERENCES stages(id)
        ON DELETE SET NULL,

    work_id         uuid REFERENCES works(id)
        ON DELETE SET NULL,

    entity_type     text NOT NULL,

    entity_id       text,

    event_type      text NOT NULL,

    severity        text NOT NULL DEFAULT 'info',

    actor_type      text NOT NULL DEFAULT 'manager',

    actor_id        text,

    message         text,

    data            jsonb NOT NULL DEFAULT '{}'::jsonb,

    created_at      timestamptz NOT NULL DEFAULT now(),

    UNIQUE(event_key)

);


CREATE INDEX IF NOT EXISTS idx_projects_status
    ON projects(status);


CREATE INDEX IF NOT EXISTS idx_stages_project
    ON stages(project_id, revision, position);


CREATE INDEX IF NOT EXISTS idx_works_stage
    ON works(stage_id, position);


CREATE INDEX IF NOT EXISTS idx_prompt_requests_project
    ON prompt_requests(project_id, created_at DESC);


CREATE INDEX IF NOT EXISTS idx_prompt_responses_request
    ON prompt_responses(prompt_request_id, received_at DESC);


CREATE INDEX IF NOT EXISTS idx_runs_project
    ON runs(project_id, created_at DESC);


CREATE INDEX IF NOT EXISTS idx_runs_status
    ON runs(status);


CREATE INDEX IF NOT EXISTS idx_run_logs_run
    ON run_logs(run_id, sequence_no);


CREATE INDEX IF NOT EXISTS idx_events_project_time
    ON events(project_id, created_at DESC);


CREATE INDEX IF NOT EXISTS idx_events_type_time
    ON events(event_type, created_at DESC);


INSERT INTO schema_migrations (
    version
)
VALUES (
    '001_initial'
)
ON CONFLICT (version)
DO NOTHING;


COMMIT;

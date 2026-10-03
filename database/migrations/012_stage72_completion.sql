BEGIN;

ALTER TABLE projects
    ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

ALTER TABLE chat_accounts
    ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

CREATE TABLE IF NOT EXISTS project_planning_messages (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id uuid NOT NULL
        REFERENCES projects(id)
        ON DELETE CASCADE,
    revision integer NOT NULL DEFAULT 1,
    role text NOT NULL,
    message_type text NOT NULL,
    content text NOT NULL,
    payload jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT project_planning_messages_role_check
        CHECK (role IN ('user', 'assistant', 'system')),
    CONSTRAINT project_planning_messages_type_check
        CHECK (
            message_type IN (
                'idea',
                'evaluation',
                'technology',
                'proposal',
                'comment',
                'decision',
                'prompt'
            )
        )
);

CREATE INDEX IF NOT EXISTS idx_project_planning_messages_project
    ON project_planning_messages(project_id, created_at);

CREATE TABLE IF NOT EXISTS project_plan_versions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id uuid NOT NULL
        REFERENCES projects(id)
        ON DELETE CASCADE,
    version integer NOT NULL,
    status text NOT NULL DEFAULT 'draft',
    title text NOT NULL,
    summary text NOT NULL DEFAULT '',
    proposal_json jsonb NOT NULL,
    source_response_id uuid
        REFERENCES prompt_responses(id)
        ON DELETE SET NULL,
    created_by text NOT NULL DEFAULT 'user',
    approved_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT project_plan_versions_project_version_key
        UNIQUE(project_id, version),
    CONSTRAINT project_plan_versions_status_check
        CHECK (status IN ('draft', 'review', 'approved', 'superseded', 'rejected')),
    CONSTRAINT project_plan_versions_created_by_check
        CHECK (created_by IN ('user', 'assistant', 'import', 'system'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_project_plan_versions_one_approved
    ON project_plan_versions(project_id)
    WHERE status = 'approved';

CREATE INDEX IF NOT EXISTS idx_project_plan_versions_project
    ON project_plan_versions(project_id, version DESC);

CREATE TABLE IF NOT EXISTS system_settings (
    setting_key text PRIMARY KEY,
    value jsonb NOT NULL DEFAULT '{}'::jsonb,
    secret_refs jsonb NOT NULL DEFAULT '{}'::jsonb,
    updated_by text NOT NULL DEFAULT 'private-admin',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS work_completion_evidence (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id uuid REFERENCES projects(id)
        ON DELETE CASCADE,
    stage_key text NOT NULL,
    work_key text NOT NULL,
    evidence_type text NOT NULL,
    status text NOT NULL,
    reference text NOT NULL,
    details jsonb NOT NULL DEFAULT '{}'::jsonb,
    recorded_at timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT work_completion_evidence_type_check
        CHECK (
            evidence_type IN (
                'implementation',
                'test',
                'review',
                'live_acceptance',
                'git'
            )
        ),
    CONSTRAINT work_completion_evidence_status_check
        CHECK (status IN ('passed', 'failed', 'pending', 'not_applicable'))
);

CREATE INDEX IF NOT EXISTS idx_work_completion_evidence_lookup
    ON work_completion_evidence(project_id, stage_key, work_key, recorded_at DESC);

INSERT INTO prompt_templates (
    template_key,
    version,
    name,
    category,
    body,
    response_contract,
    active
)
VALUES (
    'project-discovery-and-plan',
    '2',
    'Project discovery, technology review and execution plan',
    'planning',
    'Evaluate the idea, explain technology options and trade-offs, ask only essential questions, then return a complete Stage/Work proposal when enough information exists.',
    jsonb_build_object(
        'responseType', 'project_plan',
        'schemaVersion', 'stagepilot.project-plan.v1'
    ),
    true
)
ON CONFLICT (template_key, version) DO UPDATE
SET
    body = EXCLUDED.body,
    response_contract = EXCLUDED.response_contract,
    active = true;

INSERT INTO prompt_templates (
    template_key,
    version,
    name,
    category,
    body,
    response_contract,
    active
)
VALUES
    (
        'project-requirement-analysis',
        '1',
        'Project requirement analysis',
        'planning',
        'Analyze users, goals, constraints, risks, unknowns and measurable delivery conditions. Do not produce executable scripts.',
        jsonb_build_object('responseType', 'report_only'),
        true
    ),
    (
        'project-technology-options',
        '1',
        'Technology options and trade-offs',
        'planning',
        'Recommend backend, frontend, storage, queue, testing and deployment options. Explain trade-offs in plain language.',
        jsonb_build_object('responseType', 'report_only'),
        true
    ),
    (
        'project-stage-decomposition',
        '1',
        'Stage decomposition',
        'planning',
        'Convert the approved scope into ordered Stages with stable ids, objectives, dependencies and acceptance criteria.',
        jsonb_build_object('responseType', 'project_plan', 'schemaVersion', 'stagepilot.project-plan.v1'),
        true
    ),
    (
        'project-work-decomposition',
        '1',
        'Work decomposition',
        'planning',
        'Break each Stage into testable Works. Every Work needs stable ids, dependencies and measurable acceptance criteria.',
        jsonb_build_object('responseType', 'project_plan', 'schemaVersion', 'stagepilot.project-plan.v1'),
        true
    ),
    (
        'project-plan-coverage-review',
        '1',
        'Plan coverage review',
        'planning',
        'Compare the proposed plan with every approved requirement and report omissions, conflicts and unverified assumptions.',
        jsonb_build_object('responseType', 'report_only'),
        true
    )
ON CONFLICT (template_key, version) DO UPDATE
SET
    body = EXCLUDED.body,
    response_contract = EXCLUDED.response_contract,
    active = true;

INSERT INTO schema_migrations (version)
VALUES ('012_stage72_completion')
ON CONFLICT (version) DO NOTHING;

COMMIT;

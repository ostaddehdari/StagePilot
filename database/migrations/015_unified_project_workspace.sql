BEGIN;

ALTER TABLE project_plan_versions
    ADD COLUMN IF NOT EXISTS proposal_html text NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_events_project_id_desc
    ON events(project_id, id DESC);

INSERT INTO schema_migrations (version)
VALUES ('015_unified_project_workspace')
ON CONFLICT (version) DO NOTHING;

COMMIT;

BEGIN;


CREATE UNIQUE INDEX IF NOT EXISTS
    idx_conversations_one_open_per_project
ON conversations (
    project_id
)
WHERE
    status IN (
        'active',
        'pending_creation'
    );


CREATE INDEX IF NOT EXISTS
    idx_conversations_project_sequence
ON conversations (
    project_id,
    sequence_no DESC
);


CREATE INDEX IF NOT EXISTS
    idx_projects_selected_chat_account
ON projects (
    selected_chat_account_id
);


INSERT INTO schema_migrations (
    version
)
VALUES (
    '002_conversation_registry'
)
ON CONFLICT (
    version
)
DO NOTHING;


COMMIT;

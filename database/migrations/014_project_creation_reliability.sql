BEGIN;

UPDATE projects
SET settings = settings || jsonb_build_object(
        'originalSlug', slug,
        'slugReleasedAt', now()
    ),
    slug = 'deleted-' || replace(id::text, '-', '') || '-' || slug,
    updated_at = now()
WHERE deleted_at IS NOT NULL
  AND slug NOT LIKE 'deleted-' || replace(id::text, '-', '') || '-%';

UPDATE prompt_requests pr
SET status = 'failed',
    completed_at = COALESCE(completed_at, now()),
    last_error = COALESCE(last_error, 'PROJECT_DELETED')
FROM projects p
WHERE p.id = pr.project_id
  AND p.deleted_at IS NOT NULL
  AND pr.status IN ('created', 'retry', 'processing', 'sent', 'waiting_response');

INSERT INTO schema_migrations (version)
VALUES ('014_project_creation_reliability')
ON CONFLICT (version) DO NOTHING;

COMMIT;

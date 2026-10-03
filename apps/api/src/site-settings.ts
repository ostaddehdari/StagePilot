import {
    chmod,
    mkdir,
    writeFile
} from 'node:fs/promises';

import {
    resolve
} from 'node:path';

import {
    getDatabasePool
} from './db';


const GITHUB_SECRET_ROOT =
    process.env.STAGEPILOT_GITHUB_SECRET_ROOT
    ??
    '/opt/stagepilot/runtime/github';


function text(
    value: unknown
): string {
    return typeof value === 'string'
        ? value.trim()
        : '';
}


function safeLogin(
    value: unknown,
    name: string
): string {
    const result = text(value);
    if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/.test(result)) {
        throw new Error(`INVALID_${name}`);
    }
    return result;
}


function safeRepository(
    value: unknown
): string {
    const result = text(value);
    if (result && !/^[A-Za-z0-9._-]{1,100}$/.test(result)) {
        throw new Error('INVALID_DEFAULT_REPOSITORY');
    }
    return result;
}


async function writeSecret(
    filename: string,
    value: string
) {
    const root = resolve(GITHUB_SECRET_ROOT);
    const path = resolve(root, filename);
    if (!path.startsWith(`${root}/`)) {
        throw new Error('INVALID_SECRET_PATH');
    }
    await mkdir(root, { recursive: true, mode: 0o700 });
    await chmod(root, 0o700);
    await writeFile(path, `${value}\n`, { encoding: 'utf8', mode: 0o600 });
    await chmod(path, 0o600);
    return `file://${path}`;
}


export async function getSiteSettings() {
    const db = getDatabasePool();
    const result = await db.query(
        `SELECT value, secret_refs, updated_at
         FROM system_settings
         WHERE setting_key = 'global'`
    );
    const row = result.rows[0] ?? {
        value: {},
        secret_refs: {},
        updated_at: null
    };
    const value = row.value ?? {};
    const secretRefs = row.secret_refs ?? {};
    return {
        githubOwner: value.githubOwner ?? '',
        githubUsername: value.githubUsername ?? '',
        defaultRepository: value.defaultRepository ?? '',
        defaultVisibility: value.defaultVisibility ?? 'private',
        tokenConfigured: Boolean(secretRefs.githubToken),
        passwordConfigured: Boolean(secretRefs.githubPassword),
        updatedAt: row.updated_at
    };
}


export async function updateSiteSettings(
    input: {
        githubOwner?: unknown;
        githubUsername?: unknown;
        githubToken?: unknown;
        githubPassword?: unknown;
        defaultRepository?: unknown;
        defaultVisibility?: unknown;
    }
) {
    const githubOwner = safeLogin(input.githubOwner, 'GITHUB_OWNER');
    const githubUsername = safeLogin(
        input.githubUsername || input.githubOwner,
        'GITHUB_USERNAME'
    );
    const defaultRepository = safeRepository(input.defaultRepository);
    const defaultVisibility = text(input.defaultVisibility) || 'private';
    if (!['private', 'public'].includes(defaultVisibility)) {
        throw new Error('INVALID_DEFAULT_VISIBILITY');
    }

    const githubToken = text(input.githubToken);
    const githubPassword = text(input.githubPassword);
    if (githubToken && !githubToken.startsWith('github_pat_')) {
        throw new Error('EXPECTED_FINE_GRAINED_PAT');
    }

    const db = getDatabasePool();
    const existing = await db.query(
        `SELECT secret_refs
         FROM system_settings
         WHERE setting_key = 'global'`
    );
    const secretRefs = {
        ...(existing.rows[0]?.secret_refs ?? {})
    } as Record<string, string>;

    if (githubToken) {
        secretRefs.githubToken = await writeSecret(
            'github-api-token',
            githubToken
        );
    }
    if (githubPassword) {
        secretRefs.githubPassword = await writeSecret(
            'github-password-unused',
            githubPassword
        );
    }

    const client = await db.connect();
    try {
        await client.query('BEGIN');
        const profileKey = `github-${githubOwner.toLowerCase()}`;
        const profileResult = await client.query(
            `INSERT INTO github_access_profiles (
                profile_key, owner_login, status, metadata
             )
             VALUES (
                $1, $2, 'needs_verification',
                jsonb_build_object('username', $3::text, 'configuredFrom', 'site_settings')
             )
             ON CONFLICT (profile_key) DO UPDATE
             SET owner_login = EXCLUDED.owner_login,
                 status = CASE
                    WHEN github_access_profiles.owner_login <> EXCLUDED.owner_login
                    THEN 'needs_verification'
                    ELSE github_access_profiles.status
                 END,
                 metadata = github_access_profiles.metadata || EXCLUDED.metadata,
                 updated_at = now()
             RETURNING id`,
            [profileKey, githubOwner, githubUsername]
        );

        if (secretRefs.githubToken) {
            await client.query(
                `INSERT INTO github_credentials (
                    profile_id, purpose, credential_type, secret_ref, status
                 )
                 VALUES ($1::uuid, 'repository_api', 'fine_grained_pat', $2, 'configured')
                 ON CONFLICT (profile_id, purpose) DO UPDATE
                 SET secret_ref = EXCLUDED.secret_ref,
                     credential_type = EXCLUDED.credential_type,
                     status = 'configured',
                     verification = '{}'::jsonb,
                     verified_at = NULL,
                     updated_at = now()`,
                [profileResult.rows[0].id, secretRefs.githubToken]
            );
        }

        await client.query(
            `INSERT INTO system_settings (
                setting_key, value, secret_refs, updated_by
             )
             VALUES ('global', $1::jsonb, $2::jsonb, 'private-admin')
             ON CONFLICT (setting_key) DO UPDATE
             SET value = EXCLUDED.value,
                 secret_refs = EXCLUDED.secret_refs,
                 updated_by = EXCLUDED.updated_by,
                 updated_at = now()`,
            [
                JSON.stringify({
                    githubOwner,
                    githubUsername,
                    defaultRepository,
                    defaultVisibility
                }),
                JSON.stringify(secretRefs)
            ]
        );

        await client.query(
            `INSERT INTO events (
                entity_type, entity_id, event_type, severity,
                actor_type, actor_id, message, data
             )
             VALUES (
                'system_settings', 'global', 'settings.github.updated', 'info',
                'user', 'private-admin',
                'GitHub settings updated without exposing secret values.',
                jsonb_build_object(
                    'owner', $1::text,
                    'username', $2::text,
                    'tokenConfigured', $3::boolean
                )
             )`,
            [githubOwner, githubUsername, Boolean(secretRefs.githubToken)]
        );

        await client.query('COMMIT');
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }

    return getSiteSettings();
}

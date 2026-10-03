import { chmod, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

import { createInitialRepositoryPackage } from '../github/initial-repository-package.mjs';
import { processRepositoryRequest } from '../github/repository-request-orchestrator.mjs';
import { canonicalRequestFingerprint } from '../github/repository-request-policy.mjs';
import { runProcess } from './process-runner.mjs';

const WORKSPACE_ROOT = process.env.STAGEPILOT_PROJECT_WORKSPACE_ROOT
    ?? '/opt/stagepilot/storage/project-workspaces';
const ASKPASS_PATH = process.env.STAGEPILOT_GITHUB_ASKPASS
    ?? '/opt/stagepilot/runtime/github/stagepilot-askpass.sh';

async function exists(path) {
    try {
        await stat(path);
        return true;
    } catch {
        return false;
    }
}

function secretPath(reference) {
    if (!String(reference ?? '').startsWith('file://')) {
        throw new Error('GITHUB_TOKEN_REFERENCE_INVALID');
    }
    return new URL(reference).pathname;
}

export async function gitEnvironment(secretRef) {
    const tokenFile = secretPath(secretRef);
    await readFile(tokenFile, 'utf8');
    await mkdir(dirname(ASKPASS_PATH), { recursive: true, mode: 0o700 });
    await writeFile(
        ASKPASS_PATH,
        '#!/bin/sh\ncase "$1" in\n  *Username*) printf "%s\\n" "x-access-token" ;;\n  *) cat "$STAGEPILOT_GITHUB_TOKEN_FILE" ;;\nesac\n',
        { encoding: 'utf8', mode: 0o700 }
    );
    await chmod(ASKPASS_PATH, 0o700);
    return {
        GIT_ASKPASS: ASKPASS_PATH,
        GIT_TERMINAL_PROMPT: '0',
        STAGEPILOT_GITHUB_TOKEN_FILE: tokenFile
    };
}

async function loadProjectConfiguration(db, projectId) {
    const result = await db.query(
        `SELECT p.id, p.slug, p.name, p.description, p.settings,
                p.current_plan_revision,
                ppv.proposal_json,
                ss.value AS site_value, ss.secret_refs,
                gap.id AS access_profile_id
         FROM projects p
         JOIN project_plan_versions ppv
           ON ppv.project_id = p.id AND ppv.status = 'approved'
         LEFT JOIN system_settings ss ON ss.setting_key = 'global'
         LEFT JOIN github_access_profiles gap
           ON lower(gap.owner_login) = lower(ss.value->>'githubOwner')
         WHERE p.id = $1::uuid AND p.deleted_at IS NULL
         LIMIT 1`,
        [projectId]
    );
    if (result.rowCount !== 1) throw new Error('PROJECT_REPOSITORY_CONFIGURATION_MISSING');
    return result.rows[0];
}

async function ensureBinding(db, project) {
    const current = await db.query(
        `SELECT * FROM github_project_repositories
         WHERE project_id = $1::uuid AND status = 'ready'`,
        [project.id]
    );
    if (current.rowCount === 1) return current.rows[0];

    const owner = String(project.site_value?.githubOwner ?? '').trim();
    const repositoryName = String(project.settings?.repositoryName ?? project.slug).trim();
    const visibility = String(project.site_value?.defaultVisibility ?? 'private');
    const secretRef = project.secret_refs?.githubToken;
    if (!owner || !project.access_profile_id || !secretRef) {
        throw new Error('GITHUB_SETTINGS_REQUIRED');
    }
    const normalized = {
        mode: 'create',
        owner,
        repositoryName,
        visibility,
        defaultBranch: 'main'
    };
    const fingerprint = canonicalRequestFingerprint(normalized);
    const requestKey = `auto-repo:${project.id}:${fingerprint.slice(0, 16)}`;
    const inserted = await db.query(
        `INSERT INTO github_repository_requests (
            request_key, project_id, access_profile_id, mode, owner_login,
            repository_name, visibility, default_branch, request_fingerprint,
            status, approved_at, result_json
         ) VALUES (
            $1, $2::uuid, $3::uuid, 'create', $4, $5, $6, 'main', $7,
            'approved', now(), jsonb_build_object(
                'approvedBy', 'approved_project_plan',
                'automatic', true,
                'publicExplicitlyApproved', $8::boolean
            )
         )
         ON CONFLICT (request_key) DO UPDATE SET updated_at = now()
         RETURNING id`,
        [
            requestKey,
            project.id,
            project.access_profile_id,
            owner,
            repositoryName,
            visibility,
            fingerprint,
            visibility === 'public'
        ]
    );
    const result = await processRepositoryRequest({
        db,
        requestId: inserted.rows[0].id,
        secretRef
    });
    if (!result.binding) throw new Error(`GITHUB_REPOSITORY_PROVISION_FAILED:${result.outcome}`);
    const binding = await db.query(
        `SELECT * FROM github_project_repositories WHERE project_id = $1::uuid`,
        [project.id]
    );
    return binding.rows[0];
}

async function initializeWorkspace(db, project, binding) {
    const existing = await db.query(
        `SELECT * FROM github_project_workspaces
         WHERE project_id = $1::uuid AND status = 'ready'`,
        [project.id]
    );
    if (existing.rowCount === 1 && await exists(join(existing.rows[0].workspace_path, '.git'))) {
        return existing.rows[0];
    }

    const workspacePath = resolve(WORKSPACE_ROOT, project.slug);
    if (!workspacePath.startsWith(`${resolve(WORKSPACE_ROOT)}/`)) {
        throw new Error('PROJECT_WORKSPACE_OUTSIDE_ROOT');
    }
    await mkdir(WORKSPACE_ROOT, { recursive: true, mode: 0o750 });
    const remoteUrl = `https://github.com/${binding.full_name}.git`;
    const env = await gitEnvironment(project.secret_refs.githubToken);

    if (!await exists(join(workspacePath, '.git'))) {
        const clone = await runProcess('git', ['clone', remoteUrl, workspacePath], {
            cwd: WORKSPACE_ROOT,
            env,
            timeoutMs: 180_000
        });
        if (clone.exitCode !== 0) throw Object.assign(new Error('PROJECT_REPOSITORY_CLONE_FAILED'), { outcome: clone });
    }

    const head = await runProcess('git', ['rev-parse', '--verify', 'HEAD'], {
        cwd: workspacePath,
        env,
        timeoutMs: 30_000
    });
    if (head.exitCode !== 0) {
        const initial = createInitialRepositoryPackage({
            project: {
                id: project.id,
                slug: project.slug,
                name: project.name,
                description: project.description,
                currentPlanRevision: project.current_plan_revision,
                metadata: { initializedBy: 'core-automation' }
            },
            repository: {
                fullName: binding.full_name,
                visibility: binding.visibility,
                defaultBranch: binding.default_branch
            },
            plan: project.proposal_json
        });
        for (const [relativePath, content] of Object.entries(initial.files)) {
            const destination = resolve(workspacePath, relativePath);
            if (!destination.startsWith(`${workspacePath}/`)) throw new Error('INITIAL_FILE_PATH_INVALID');
            await mkdir(dirname(destination), { recursive: true, mode: 0o750 });
            await writeFile(destination, content, 'utf8');
        }
        await runProcess('git', ['checkout', '-B', binding.default_branch || 'main'], { cwd: workspacePath, env });
        await runProcess('git', ['add', '-A'], { cwd: workspacePath, env });
        const commit = await runProcess('git', [
            '-c', 'user.name=StagePilot', '-c', 'user.email=stagepilot@localhost',
            'commit', '-m', 'Initialize StagePilot project'
        ], { cwd: workspacePath, env });
        if (commit.exitCode !== 0) throw Object.assign(new Error('INITIAL_PROJECT_COMMIT_FAILED'), { outcome: commit });
        const push = await runProcess('git', ['push', '-u', 'origin', `HEAD:${binding.default_branch || 'main'}`], {
            cwd: workspacePath,
            env,
            timeoutMs: 180_000
        });
        if (push.exitCode !== 0) throw Object.assign(new Error('INITIAL_PROJECT_PUSH_FAILED'), { outcome: push });
    }

    const verifiedHead = await runProcess('git', ['rev-parse', 'HEAD'], { cwd: workspacePath, env });
    const result = await db.query(
        `INSERT INTO github_project_workspaces (
            project_id, repository_binding_id, workspace_path, remote_name,
            remote_url, branch_name, status, verified_head_sha,
            verified_remote_sha, last_verified_at, metadata
         ) VALUES (
            $1::uuid, $2::uuid, $3, 'origin', $4, $5, 'ready', $6, $6, now(),
            jsonb_build_object('provisionedBy', 'core-automation')
         )
         ON CONFLICT (project_id) DO UPDATE SET
            repository_binding_id = EXCLUDED.repository_binding_id,
            workspace_path = EXCLUDED.workspace_path,
            remote_url = EXCLUDED.remote_url,
            branch_name = EXCLUDED.branch_name,
            status = 'ready', verified_head_sha = EXCLUDED.verified_head_sha,
            verified_remote_sha = EXCLUDED.verified_remote_sha,
            last_verified_at = now(), updated_at = now()
         RETURNING *`,
        [
            project.id,
            binding.id,
            workspacePath,
            remoteUrl,
            binding.default_branch || 'main',
            verifiedHead.stdout.trim()
        ]
    );
    return result.rows[0];
}

export async function ensureProjectRepository(db, projectId) {
    const project = await loadProjectConfiguration(db, projectId);
    const binding = await ensureBinding(db, project);
    const workspace = await initializeWorkspace(db, project, binding);
    return {
        project,
        binding,
        workspace,
        gitEnv: await gitEnvironment(project.secret_refs.githubToken)
    };
}

import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmod, mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const MAX_LOG_BYTES = Number(process.env.STAGEPILOT_MAX_LOG_BYTES ?? 2_000_000);

export function sha256(value) {
    return createHash('sha256').update(String(value ?? ''), 'utf8').digest('hex');
}

export function runProcess(command, args, {
    cwd,
    env = {},
    timeoutMs = 600_000
} = {}) {
    return new Promise((resolvePromise, rejectPromise) => {
        const startedAt = new Date();
        const child = spawn(command, args, {
            cwd,
            env: {
                PATH: '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
                LANG: 'C.UTF-8',
                LC_ALL: 'C.UTF-8',
                GIT_TERMINAL_PROMPT: '0',
                ...env
            },
            stdio: ['ignore', 'pipe', 'pipe']
        });
        let stdout = '';
        let stderr = '';
        let truncated = false;
        const append = (current, chunk) => {
            const next = current + chunk.toString('utf8');
            if (Buffer.byteLength(next, 'utf8') <= MAX_LOG_BYTES) return next;
            truncated = true;
            return next.slice(-MAX_LOG_BYTES);
        };
        child.stdout.on('data', chunk => { stdout = append(stdout, chunk); });
        child.stderr.on('data', chunk => { stderr = append(stderr, chunk); });
        child.once('error', rejectPromise);
        const timer = setTimeout(() => child.kill('SIGTERM'), timeoutMs);
        child.once('close', (code, signal) => {
            clearTimeout(timer);
            resolvePromise({
                command,
                args,
                exitCode: Number(code ?? 1),
                signal,
                stdout,
                stderr,
                truncated,
                startedAt: startedAt.toISOString(),
                finishedAt: new Date().toISOString()
            });
        });
    });
}

function assertSafeScript(script) {
    if (script.language !== 'bash' && script.language !== 'sh') {
        throw new Error(`UNSUPPORTED_SCRIPT_LANGUAGE:${script.language}`);
    }
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,80}\.sh$/.test(script.filename)) {
        throw new Error(`UNSAFE_SCRIPT_FILENAME:${script.filename}`);
    }
    const forbidden = [
        /\brm\s+-[^\n]*r[^\n]*f[^\n]*\s+(?:\/|~|\$HOME)(?:\s|$)/i,
        /\b(?:shutdown|reboot|poweroff|mkfs|fdisk)\b/i,
        /\bsudo\b/i,
        /\/etc\/(?:passwd|shadow|sudoers)/i,
        /\bgit\s+(?:push|reset\s+--hard|clean\s+-)/i
    ];
    if (forbidden.some(pattern => pattern.test(script.content))) {
        throw new Error(`SCRIPT_POLICY_BLOCKED:${script.filename}`);
    }
}

export async function executeScripts({ projectId, runKey, workspacePath, scripts }) {
    const workspace = resolve(workspacePath);
    if (workspace === '/') throw new Error('WORKSPACE_ROOT_FORBIDDEN');
    const root = resolve(
        process.env.STAGEPILOT_EXECUTION_ROOT ?? '/opt/stagepilot/runtime/executions',
        projectId,
        runKey.replace(/[^A-Za-z0-9._-]/g, '_')
    );
    await mkdir(root, { recursive: true, mode: 0o700 });
    const outcomes = [];
    for (const script of scripts) {
        assertSafeScript(script);
        const path = join(root, script.filename);
        await writeFile(path, script.content, { encoding: 'utf8', mode: 0o700 });
        await chmod(path, 0o700);
        const syntax = await runProcess('/bin/bash', ['-n', path], {
            cwd: workspace,
            timeoutMs: 30_000
        });
        if (syntax.exitCode !== 0) {
            throw Object.assign(new Error(`SCRIPT_SYNTAX_FAILED:${script.filename}`), {
                outcome: syntax
            });
        }
        const outcome = await runProcess('/bin/bash', [path], {
            cwd: workspace,
            env: {
                HOME: workspace,
                STAGEPILOT_PROJECT_ID: projectId,
                STAGEPILOT_RUN_KEY: runKey,
                STAGEPILOT_WORKSPACE: workspace
            },
            timeoutMs: Number(process.env.STAGEPILOT_SCRIPT_TIMEOUT_MS ?? 900_000)
        });
        outcomes.push({
            ...outcome,
            filename: script.filename,
            contentSha256: sha256(script.content)
        });
        if (outcome.exitCode !== 0) {
            throw Object.assign(new Error(`SCRIPT_EXECUTION_FAILED:${script.filename}`), {
                outcome,
                outcomes
            });
        }
    }
    return { executionRoot: root, outcomes };
}

export async function runVerification(workspacePath, configuredCommand = '') {
    const command = String(configuredCommand ?? '').trim();
    if (command.includes('\n') || command.length > 500) {
        throw new Error('INVALID_TEST_COMMAND');
    }
    const actual = command || 'if [ -f package.json ]; then npm test --if-present && npm run build --if-present; elif [ -f pytest.ini ] || [ -d tests ]; then python3 -m pytest; else git diff --check; fi';
    return await runProcess('/bin/bash', ['-lc', actual], {
        cwd: resolve(workspacePath),
        env: { HOME: resolve(workspacePath) },
        timeoutMs: Number(process.env.STAGEPILOT_TEST_TIMEOUT_MS ?? 1_200_000)
    });
}

export async function commitAndPush({ workspacePath, stageKey, workKey, title, env = {} }) {
    const cwd = resolve(workspacePath);
    const status = await runProcess('git', ['status', '--porcelain'], { cwd, timeoutMs: 30_000 });
    if (status.exitCode !== 0) throw new Error('GIT_STATUS_FAILED');
    if (!status.stdout.trim()) {
        throw new Error('WORK_PRODUCED_NO_CHANGES');
    }
    const add = await runProcess('git', ['add', '-A'], { cwd, timeoutMs: 60_000 });
    if (add.exitCode !== 0) throw Object.assign(new Error('GIT_ADD_FAILED'), { outcome: add });
    const message = `${stageKey}/${workKey}: ${title}`.slice(0, 180);
    const commit = await runProcess('git', ['-c', 'user.name=StagePilot', '-c', 'user.email=stagepilot@localhost', 'commit', '-m', message], {
        cwd,
        timeoutMs: 120_000
    });
    if (commit.exitCode !== 0) throw Object.assign(new Error('GIT_COMMIT_FAILED'), { outcome: commit });
    const head = await runProcess('git', ['rev-parse', 'HEAD'], { cwd, timeoutMs: 30_000 });
    const push = await runProcess('git', ['push', 'origin', 'HEAD'], {
        cwd,
        env,
        timeoutMs: 180_000
    });
    if (push.exitCode !== 0) throw Object.assign(new Error('GIT_PUSH_FAILED'), { outcome: push });
    return { changed: true, commitSha: head.stdout.trim(), push };
}

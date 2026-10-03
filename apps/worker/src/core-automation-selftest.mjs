import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const root = await mkdtemp(join(tmpdir(), 'stagepilot-core-automation-'));
process.env.STAGEPILOT_EXECUTION_ROOT = join(root, 'executions');

const { executeScripts, runVerification } = await import('./process-runner.mjs');

try {
    const workspace = join(root, 'workspace');
    const { mkdir } = await import('node:fs/promises');
    await mkdir(workspace, { recursive: true });
    const execution = await executeScripts({
        projectId: 'selftest-project',
        runKey: 'S01-W01-1',
        workspacePath: workspace,
        scripts: [{
            filename: 'run.sh',
            language: 'bash',
            content: '#!/usr/bin/env bash\nset -Eeuo pipefail\nprintf "verified\\n" > result.txt\n'
        }]
    });
    if (execution.outcomes[0]?.exitCode !== 0) throw new Error('SAFE_SCRIPT_DID_NOT_RUN');
    if ((await readFile(join(workspace, 'result.txt'), 'utf8')).trim() !== 'verified') {
        throw new Error('SAFE_SCRIPT_RESULT_MISSING');
    }
    const verification = await runVerification(workspace, 'test "$(cat result.txt)" = verified');
    if (verification.exitCode !== 0) throw new Error('VERIFICATION_DID_NOT_PASS');

    let blocked = false;
    try {
        await executeScripts({
            projectId: 'selftest-project',
            runKey: 'S01-W02-1',
            workspacePath: workspace,
            scripts: [{
                filename: 'unsafe.sh',
                language: 'bash',
                content: '#!/usr/bin/env bash\nsudo reboot\n'
            }]
        });
    } catch (error) {
        blocked = String(error?.message).startsWith('SCRIPT_POLICY_BLOCKED:');
    }
    if (!blocked) throw new Error('UNSAFE_SCRIPT_NOT_BLOCKED');

    console.log(JSON.stringify({
        ok: true,
        suite: 'core-automation',
        safeExecution: true,
        verification: true,
        unsafeBlocked: true
    }));
} finally {
    await rm(root, { recursive: true, force: true });
}

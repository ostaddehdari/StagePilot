import { constants } from 'node:fs';
import { mkdir, open, readFile, unlink } from 'node:fs/promises';
import { hostname } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';


const CAPACITY_ROOT =
    process.env.STAGEPILOT_BROWSER_CAPACITY_ROOT
    ??
    '/opt/stagepilot/runtime/browser-capacity';


function maximumBrowsers() {
    const value = Number(process.env.STAGEPILOT_BROWSER_MAX_CONCURRENT ?? 2);
    if (!Number.isInteger(value) || value < 1 || value > 20) {
        throw new Error('INVALID_BROWSER_CAPACITY');
    }
    return value;
}


function pidAlive(pid) {
    if (!Number.isInteger(pid) || pid < 1) return false;
    try {
        process.kill(pid, 0);
        return true;
    } catch (error) {
        return error?.code === 'EPERM';
    }
}


async function stale(path) {
    try {
        const payload = JSON.parse(await readFile(path, 'utf8'));
        return payload.hostname === hostname() && !pidAlive(payload.pid);
    } catch {
        return true;
    }
}


export async function acquireBrowserCapacity(
    metadata = {}
) {
    await mkdir(CAPACITY_ROOT, { recursive: true, mode: 0o700 });
    const token = randomUUID();
    const limit = maximumBrowsers();

    for (let pass = 0; pass < 2; pass += 1) {
        for (let slot = 1; slot <= limit; slot += 1) {
            const path = join(CAPACITY_ROOT, `slot-${slot}.lock`);
            try {
                const handle = await open(
                    path,
                    constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY,
                    0o600
                );
                const payload = {
                    token,
                    slot,
                    pid: process.pid,
                    hostname: hostname(),
                    acquiredAt: new Date().toISOString(),
                    metadata
                };
                try {
                    await handle.writeFile(JSON.stringify(payload, null, 2));
                } finally {
                    await handle.close();
                }
                let released = false;
                return {
                    slot,
                    path,
                    async release() {
                        if (released) return;
                        const current = JSON.parse(await readFile(path, 'utf8'));
                        if (current.token !== token) {
                            throw new Error('BROWSER_CAPACITY_TOKEN_MISMATCH');
                        }
                        await unlink(path);
                        released = true;
                    }
                };
            } catch (error) {
                if (error?.code !== 'EEXIST') throw error;
                if (pass === 0 && await stale(path)) {
                    await unlink(path).catch(() => {});
                }
            }
        }
    }

    throw new Error('BROWSER_CAPACITY_EXHAUSTED');
}

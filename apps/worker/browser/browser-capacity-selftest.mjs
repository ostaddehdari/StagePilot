import assert from 'node:assert/strict';

import {
    acquireBrowserCapacity
} from './browser-capacity.mjs';


if (!process.env.STAGEPILOT_BROWSER_CAPACITY_ROOT) {
    throw new Error('BROWSER_CAPACITY_ROOT_MISSING');
}

process.env.STAGEPILOT_BROWSER_MAX_CONCURRENT = '2';

const first = await acquireBrowserCapacity({ test: 'first' });
const second = await acquireBrowserCapacity({ test: 'second' });

assert.notEqual(first.slot, second.slot);

let blocked = false;
try {
    await acquireBrowserCapacity({ test: 'blocked' });
} catch (error) {
    blocked = error?.message === 'BROWSER_CAPACITY_EXHAUSTED';
}

assert.equal(blocked, true);

await first.release();
const recovered = await acquireBrowserCapacity({ test: 'recovered' });
assert.equal(recovered.slot, first.slot);

await recovered.release();
await second.release();

console.log(JSON.stringify({
    ok: true,
    suite: 'browser-capacity',
    maximum: 2,
    blocked,
    recovered: true
}));

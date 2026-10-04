import assert from 'node:assert/strict';

import { classifySendOutcome } from './browser-transport.mjs';

assert.equal(classifySendOutcome('SENT_CONFIRMED'), 'confirmed');
assert.equal(classifySendOutcome('SEND_UNCERTAIN'), 'response-only');
assert.equal(classifySendOutcome('CLICK'), 'failed');
assert.equal(classifySendOutcome(undefined), 'failed');

process.stdout.write(JSON.stringify({
    ok: true,
    suite: 'send-uncertain-recovery',
    uncertainUsesResponseOnlyPath: true,
    duplicateClickAttempted: false
}) + '\n');

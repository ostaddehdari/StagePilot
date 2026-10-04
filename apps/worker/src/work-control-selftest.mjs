import assert from 'node:assert/strict';

import { chooseReadyWork } from './work-processor.mjs';

const rows = [
    { id: 'w1', stage_id: 's1', work_key: 'S01-W01', status: 'completed', dependencies: [] },
    { id: 'w2', stage_id: 's1', work_key: 'S01-W02', status: 'pending', dependencies: ['S01-W01'] },
    { id: 'w3', stage_id: 's2', work_key: 'S02-W01', status: 'pending', dependencies: [] },
    { id: 'w4', stage_id: 's2', work_key: 'S02-W02', status: 'pending', dependencies: ['missing'] }
];

assert.equal(chooseReadyWork(rows, { metadata: {} }).candidate.id, 'w2');
assert.equal(
    chooseReadyWork(rows, { metadata: { selectedWorkId: 'w3' } }).candidate.id,
    'w3'
);
assert.equal(
    chooseReadyWork(rows, { metadata: { selectedStageId: 's2' } }).candidate.id,
    'w3'
);
assert.equal(
    chooseReadyWork(rows, { metadata: { selectedWorkId: 'w4' } }).candidate,
    null
);

process.stdout.write(`${JSON.stringify({
    ok: true,
    suite: 'work-control',
    exactWorkPriority: true,
    stagePriority: true,
    unmetDependenciesBlocked: true
})}\n`);

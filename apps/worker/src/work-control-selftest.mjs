import assert from 'node:assert/strict';

import { chooseReadyWork, serializeWorkerError } from './work-processor.mjs';

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

const sampleError = Object.assign(new Error('WORKER_SAMPLE_FAILURE'), {
    code: 'E_SAMPLE',
    diagnostic: { phase: 'execution', safe: true }
});
const serializedError = JSON.parse(serializeWorkerError(sampleError));
assert.equal(serializedError.message, 'WORKER_SAMPLE_FAILURE');
assert.equal(serializedError.code, 'E_SAMPLE');
assert.equal(serializedError.diagnostic.phase, 'execution');
assert.match(serializedError.stack, /WORKER_SAMPLE_FAILURE/);

process.stdout.write(`${JSON.stringify({
    ok: true,
    suite: 'work-control',
    exactWorkPriority: true,
    stagePriority: true,
    unmetDependenciesBlocked: true,
    workerErrorStackCaptured: true
})}\n`);

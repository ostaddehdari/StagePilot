import assert from 'node:assert/strict';

import {
    validateResponseEnvelope
} from './response-contract.mjs';


const valid = {
    responseType: 'project_plan',
    summary: 'Validated plan',
    plan: {
        schemaVersion: 'stagepilot.project-plan.v1',
        projectName: 'Sample',
        summary: 'A complete plan',
        technologies: [],
        assumptions: [],
        stages: [
            {
                id: 'S01',
                title: 'Foundation',
                objective: 'Build foundation',
                weight: 1,
                acceptanceCriteria: ['Foundation is tested'],
                works: [
                    {
                        id: 'S01-W01',
                        title: 'Bootstrap',
                        objective: 'Bootstrap project',
                        weight: 1,
                        dependsOn: [],
                        acceptanceCriteria: ['Build passes']
                    }
                ]
            }
        ]
    }
};

assert.equal(validateResponseEnvelope(valid).ok, true);

const missingCriteria = structuredClone(valid);
missingCriteria.plan.stages[0].works[0].acceptanceCriteria = [];
assert.equal(validateResponseEnvelope(missingCriteria).ok, false);

const cyclic = structuredClone(valid);
cyclic.plan.stages[0].works.push({
    id: 'S01-W02',
    title: 'Cycle',
    objective: 'Invalid cycle',
    weight: 1,
    dependsOn: ['S01-W01'],
    acceptanceCriteria: ['Never accepted']
});
cyclic.plan.stages[0].works[0].dependsOn = ['S01-W02'];
assert.equal(validateResponseEnvelope(cyclic).ok, false);

console.log(JSON.stringify({
    ok: true,
    suite: 'project-plan-contract',
    cases: 3
}));

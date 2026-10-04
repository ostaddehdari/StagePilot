import assert from 'node:assert/strict';

import { validateProjectProposalEnvelope } from './project-proposal-contract.mjs';


const proposal = {
    responseType: 'project_proposal',
    summary: 'پروپوزال آماده بررسی است.',
    proposalMarkdown: '# پروپوزال حرفه‌ای\n\nشرح کامل پروژه',
    proposal: {
        schemaVersion: 'stagepilot.project-proposal.v1',
        title: 'سامانه نمونه',
        executiveSummary: 'خلاصه اجرایی روشن و قابل سنجش',
        problemStatement: 'مسئله‌ای که باید حل شود',
        objectives: ['تحویل نتیجه قابل آزمون'],
        targetUsers: ['مدیر پروژه'],
        scope: { inScope: ['وب‌اپلیکیشن'], outOfScope: ['اپ موبایل'] },
        functionalRequirements: [{
            id: 'FR-01',
            title: 'مدیریت پروژه',
            description: 'کاربر پروژه را مدیریت می‌کند.',
            priority: 'must',
            acceptanceCriteria: ['عملیات با تست یکپارچه تأیید شود.']
        }],
        nonFunctionalRequirements: ['امنیت و مشاهده‌پذیری'],
        architecture: {
            overview: 'معماری ماژولار',
            components: ['وب', 'API'],
            integrations: [], security: [], operations: []
        },
        technologyRecommendations: [],
        qualityStrategy: {
            testLevels: ['unit', 'integration', 'e2e'],
            stageExitPolicy: ['تمام تست‌ها باید موفق باشند.'],
            observability: ['لاگ ساخت‌یافته']
        },
        delivery: { assumptions: [], constraints: [], risks: [] }
    }
};

assert.equal(validateProjectProposalEnvelope(proposal).title, 'سامانه نمونه');
assert.throws(
    () => validateProjectProposalEnvelope({
        ...proposal,
        proposal: { ...proposal.proposal, functionalRequirements: [] }
    }),
    /PROPOSAL_FUNCTIONAL_REQUIREMENTS_REQUIRED/
);

process.stdout.write(JSON.stringify({
    ok: true,
    suite: 'project-proposal-contract',
    officialProposalValidated: true,
    missingRequirementsBlocked: true
}) + '\n');

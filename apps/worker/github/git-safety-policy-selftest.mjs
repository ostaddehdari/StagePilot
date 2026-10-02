import {

    classifyWorkspaceState,
    classifyRemoteRelation,
    classifyPushFailure,
    validateAutomatedGitArgs,
    verifyHooksIsolation,
    buildGitSafetyReport,
    gitSafetyDefaults

} from './git-safety-policy.mjs';


const failures = [];


function check(
    name,
    condition
) {

    if (
        condition
    ) {

        console.log(
            `${name}: PASS`
        );

    } else {

        failures.push(
            name
        );

        console.log(
            `${name}: FAIL`
        );

    }

}


const clean =
    classifyWorkspaceState({
        statusPorcelain:
            ''
    });


check(
    'clean-tree',
    clean.state
    ===
    'CLEAN'
    &&
    clean.safeToCommit
    ===
    true
);


const dirty =
    classifyWorkspaceState({
        statusPorcelain:
            ' M src/app.js\n?? notes.txt'
    });


check(
    'dirty-tree-detected',
    dirty.state
    ===
    'DIRTY_TREE'
);


check(
    'dirty-tree-blocks-mutation',
    dirty.safeToCommit
    ===
    false
    &&
    dirty.safeToPush
    ===
    false
);


check(
    'dirty-tree-preserves-user-changes',
    dirty.preserveManualChanges
    ===
    true
    &&
    dirty.automaticClean
    ===
    false
    &&
    dirty.automaticReset
    ===
    false
    &&
    dirty.automaticStash
    ===
    false
);


const conflict =
    classifyWorkspaceState({
        statusPorcelain:
            'UU src/app.js',

        unmergedPaths: [
            'src/app.js'
        ]
    });


check(
    'merge-conflict-detected',
    conflict.state
    ===
    'MERGE_CONFLICT'
);


check(
    'merge-conflict-needs-decision',
    conflict.decisionRequired
    ===
    true
    &&
    conflict.automaticResolution
    ===
    false
);


const inSync =
    classifyRemoteRelation({
        ahead:
            0,

        behind:
            0
    });


check(
    'remote-in-sync',
    inSync.state
    ===
    'IN_SYNC'
);


const localAhead =
    classifyRemoteRelation({
        ahead:
            1,

        behind:
            0
    });


check(
    'local-ahead-can-push',
    localAhead.state
    ===
    'LOCAL_AHEAD'
    &&
    localAhead.pushAllowed
    ===
    true
);


const remoteAhead =
    classifyRemoteRelation({
        ahead:
            0,

        behind:
            2
    });


check(
    'remote-ahead-blocks-push',
    remoteAhead.state
    ===
    'REMOTE_AHEAD'
    &&
    remoteAhead.pushAllowed
    ===
    false
);


check(
    'remote-ahead-no-auto-rebase',
    remoteAhead.automaticRebase
    ===
    false
    &&
    remoteAhead.automaticForcePush
    ===
    false
);


const diverged =
    classifyRemoteRelation({
        ahead:
            2,

        behind:
            3
    });


check(
    'remote-divergence-detected',
    diverged.state
    ===
    'REMOTE_DIVERGED'
);


check(
    'divergence-requires-decision',
    diverged.decisionRequired
    ===
    true
    &&
    diverged.automaticMerge
    ===
    false
    &&
    diverged.automaticRebase
    ===
    false
    &&
    diverged.automaticForcePush
    ===
    false
);


const permission =
    classifyPushFailure({
        stderr:
            'remote: Permission to owner/repo.git denied to user.',
        exitCode:
            128
    });


check(
    'permission-failure-classified',
    permission.issueType
    ===
    'PERMISSION_DENIED'
);


check(
    'permission-failure-needs-fix',
    permission.retryAction
    ===
    'REQUIRE_PERMISSION_FIX'
    &&
    permission.rerunImplementation
    ===
    false
);


const remoteRejected =
    classifyPushFailure({
        stderr:
            'Updates were rejected because the remote contains work that you do not have locally. fetch first',
        exitCode:
            1
    });


check(
    'remote-change-classified',
    remoteRejected.issueType
    ===
    'REMOTE_REJECTED'
    &&
    remoteRejected.retryAction
    ===
    'RECONCILE_REMOTE'
);


const network =
    classifyPushFailure({
        stderr:
            'ssh: Could not resolve host github.com',
        exitCode:
            128
    });


check(
    'network-push-only',
    network.issueType
    ===
    'NETWORK_FAILURE'
    &&
    network.retryAction
    ===
    'PUSH_ONLY'
);


check(
    'safe-push-allowed',

    validateAutomatedGitArgs([
        'push',
        'origin',
        'stage/S06:stage/S06'
    ]).allowed
    ===
    true
);


let forceRejected =
    false;


try {

    validateAutomatedGitArgs([
        'push',
        '--force',
        'origin',
        'stage/S06'
    ]);

} catch {

    forceRejected =
        true;

}


check(
    'force-push-rejected',
    forceRejected
);


let forceLeaseRejected =
    false;


try {

    validateAutomatedGitArgs([
        'push',
        '--force-with-lease',
        'origin',
        'stage/S06'
    ]);

} catch {

    forceLeaseRejected =
        true;

}


check(
    'force-with-lease-rejected',
    forceLeaseRejected
);


let plusRefRejected =
    false;


try {

    validateAutomatedGitArgs([
        'push',
        'origin',
        '+stage/S06:stage/S06'
    ]);

} catch {

    plusRefRejected =
        true;

}


check(
    'plus-ref-force-rejected',
    plusRefRejected
);


let cleanRejected =
    false;


try {

    validateAutomatedGitArgs([
        'clean',
        '-fd'
    ]);

} catch {

    cleanRejected =
        true;

}


check(
    'automatic-clean-rejected',
    cleanRejected
);


let resetRejected =
    false;


try {

    validateAutomatedGitArgs([
        'reset',
        '--hard',
        'HEAD'
    ]);

} catch {

    resetRejected =
        true;

}


check(
    'automatic-reset-rejected',
    resetRejected
);


let stashRejected =
    false;


try {

    validateAutomatedGitArgs([
        'stash',
        'push'
    ]);

} catch {

    stashRejected =
        true;

}


check(
    'automatic-stash-rejected',
    stashRejected
);


let mergeRejected =
    false;


try {

    validateAutomatedGitArgs([
        'merge',
        'origin/main'
    ]);

} catch {

    mergeRejected =
        true;

}


check(
    'automatic-merge-rejected',
    mergeRejected
);


const hooksSafe =
    verifyHooksIsolation({
        configuredHooksPath:
            '/opt/stagepilot/runtime/git-empty-hooks',

        expectedHooksPath:
            '/opt/stagepilot/runtime/git-empty-hooks'
    });


check(
    'isolated-hooks-accepted',
    hooksSafe.verified
    ===
    true
    &&
    hooksSafe.untrustedHooksDisabled
    ===
    true
);


const hooksUnsafe =
    verifyHooksIsolation({
        configuredHooksPath:
            '.git/hooks',

        expectedHooksPath:
            '/opt/stagepilot/runtime/git-empty-hooks'
    });


check(
    'untrusted-hooks-blocked',
    hooksUnsafe.verified
    ===
    false
    &&
    hooksUnsafe.mutationAllowed
    ===
    false
);


const report =
    buildGitSafetyReport({
        issueType:
            'REMOTE_DIVERGED',

        status:
            'decision_required',

        decisionRequired:
            true,

        localEvidence: {
            headSha:
                'local-sha',

            ahead:
                2
        },

        remoteEvidence: {
            headSha:
                'remote-sha',

            behind:
                3
        },

        metadata: {
            stage:
                'S06',

            work:
                'W06'
        }
    });


check(
    'report-separates-local-evidence',
    report.localEvidence.headSha
    ===
    'local-sha'
);


check(
    'report-separates-remote-evidence',
    report.remoteEvidence.headSha
    ===
    'remote-sha'
);


check(
    'report-preserves-manual-changes',
    report.preservesManualChanges
    ===
    true
);


check(
    'report-force-push-disabled',
    report.automaticForcePush
    ===
    false
);


const defaults =
    gitSafetyDefaults();


check(
    'defaults-preserve-manual-changes',
    defaults.preserveManualChanges
    ===
    true
);


check(
    'defaults-no-force-push',
    defaults.automaticForcePush
    ===
    false
);


check(
    'defaults-separate-evidence',
    defaults.separateLocalRemoteEvidence
    ===
    true
);


if (
    failures.length > 0
) {

    console.error(
        `GIT_SAFETY_POLICY_SELFTEST_FAILURES=${failures.join(',')}`
    );

    process.exit(
        1
    );

}


console.log(
    'GIT_SAFETY_POLICY_SELFTEST=PASS'
);

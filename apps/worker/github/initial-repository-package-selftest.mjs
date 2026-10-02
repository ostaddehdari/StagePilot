import {

    createInitialRepositoryPackage,
    INITIAL_PACKAGE_PATHS,
    validateRepositoryContent,
    validateGitignoreContent

} from './initial-repository-package.mjs';


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


const result =
    createInitialRepositoryPackage({

        project: {

            id:
                'project-123',

            slug:
                'sample-project',

            name:
                'Sample Project',

            description:
                'Sample project.',

            currentPlanRevision:
                4,

            metadata: {

                language:
                    'fa',

                password:
                    'remove',

                token:
                    'remove',

                serverHost:
                    '192.0.2.1',

                workspacePath:
                    '/srv/private',

                safeValue:
                    'keep',

                nested: {

                    privateKey:
                        'remove',

                    safe:
                        true

                }

            }

        },

        repository: {

            fullName:
                'ostaddehdari/SampleProject',

            visibility:
                'private',

            defaultBranch:
                'main'

        },

        plan: {

            stages: [
                {
                    id:
                        'S01',

                    title:
                        'Foundation'
                }
            ],

            credential:
                'remove',

            runtimePath:
                '/opt/private/runtime'

        }

    });


const paths =
    Object.keys(
        result.files
    ).sort();


check(
    'exact-file-set',

    JSON.stringify(
        paths
    )
    ===
    JSON.stringify(
        [
            ...INITIAL_PACKAGE_PATHS
        ].sort()
    )
);


check(
    'file-count-four',
    paths.length
    ===
    4
);


check(
    'gitignore-valid',

    validateGitignoreContent(
        result.files[
            '.gitignore'
        ]
    )
    ===
    true
);


check(
    'gitignore-browser-profiles',

    result.files[
        '.gitignore'
    ].includes(
        'browser-profiles/'
    )
);


check(
    'gitignore-browser-sessions',

    result.files[
        '.gitignore'
    ].includes(
        'browser-sessions/'
    )
);


const project =
    JSON.parse(
        result.files[
            'stagepilot/project.json'
        ]
    );


check(
    'safe-metadata-preserved',
    project.metadata.safeValue
    ===
    'keep'
);


check(
    'password-removed',
    project.metadata.password
    ===
    undefined
);


check(
    'token-removed',
    project.metadata.token
    ===
    undefined
);


check(
    'server-host-removed',
    project.metadata.serverHost
    ===
    undefined
);


check(
    'workspace-path-removed',
    project.metadata.workspacePath
    ===
    undefined
);


check(
    'nested-private-key-removed',
    project.metadata.nested.privateKey
    ===
    undefined
);


const plan =
    JSON.parse(
        result.files[
            'stagepilot/plan.json'
        ]
    );


check(
    'plan-preserved',
    plan.plan.stages.length
    ===
    1
);


check(
    'plan-credential-removed',
    plan.plan.credential
    ===
    undefined
);


check(
    'plan-runtime-path-removed',
    plan.plan.runtimePath
    ===
    undefined
);


check(
    'manifest-four',
    Object.keys(
        result.manifest
    ).length
    ===
    4
);


const privateKeyFixture =
    [
        '-----BEGIN',
        'OPENSSH PRIVATE KEY-----'
    ].join(
        ' '
    );


let privateKeyRejected =
    false;


try {

    validateRepositoryContent(
        privateKeyFixture,
        'bad.txt'
    );

} catch {

    privateKeyRejected =
        true;

}


check(
    'private-key-rejected',
    privateKeyRejected
);


const tokenFixture =
    [
        'github',
        'pat',
        'abcdefghijklmnopqrstuvwxyz0123456789'
    ].join(
        '_'
    );


let tokenRejected =
    false;


try {

    validateRepositoryContent(
        tokenFixture,
        'bad.txt'
    );

} catch {

    tokenRejected =
        true;

}


check(
    'token-content-rejected',
    tokenRejected
);


let incompleteGitignoreRejected =
    false;


try {

    validateGitignoreContent(
        '.env\nnode_modules/\n'
    );

} catch {

    incompleteGitignoreRejected =
        true;

}


check(
    'incomplete-gitignore-rejected',
    incompleteGitignoreRejected
);


check(
    'safety-secrets-false',
    result.safety.secretsIncluded
    ===
    false
);


check(
    'safety-browser-profiles-false',
    result.safety.browserProfilesIncluded
    ===
    false
);


if (
    failures.length > 0
) {

    console.error(
        `INITIAL_PACKAGE_SELFTEST_FAILURES=${failures.join(',')}`
    );

    process.exit(
        1
    );

}


console.log(
    'INITIAL_REPOSITORY_PACKAGE_SELFTEST=PASS'
);

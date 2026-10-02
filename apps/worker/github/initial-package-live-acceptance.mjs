import {
    mkdir,
    readFile,
    rm,
    writeFile,
    chmod
} from 'node:fs/promises';

import {
    dirname,
    join
} from 'node:path';

import {
    spawn
} from 'node:child_process';

import {
    Pool
} from 'pg';

import {
    createRepository,
    deleteRepository,
    getRepository,
    githubRequest
} from './github-api-client.mjs';

import {
    createInitialRepositoryPackage
} from './initial-repository-package.mjs';


const owner =
    process.env.STAGEPILOT_GITHUB_OWNER;


const profileId =
    process.env.STAGEPILOT_GITHUB_PROFILE_ID;


const secretRef =
    process.env.STAGEPILOT_GITHUB_API_SECRET_REF;


const workspaceRoot =
    process.env.STAGEPILOT_WORKSPACE_ROOT;


const acceptanceRoot =
    process.env.STAGEPILOT_GITHUB_ACCEPTANCE_ROOT;


const knownHosts =
    process.env.STAGEPILOT_GITHUB_KNOWN_HOSTS;


if (
    process.env.STAGEPILOT_LIVE_GITHUB_ACCEPTANCE
    !==
    '1'
) {

    throw new Error(
        'LIVE_ACCEPTANCE_NOT_ENABLED'
    );

}


if (
    !owner
    ||
    !profileId
    ||
    !secretRef
    ||
    !workspaceRoot
    ||
    !acceptanceRoot
    ||
    !knownHosts
) {

    throw new Error(
        'LIVE_ACCEPTANCE_CONFIGURATION_MISSING'
    );

}


const pool =
    new Pool({
        host:
            process.env.STAGEPILOT_DB_HOST,

        port:
            Number(
                process.env.STAGEPILOT_DB_PORT
            ),

        user:
            process.env.STAGEPILOT_DB_USER,

        password:
            process.env.STAGEPILOT_DB_PASSWORD,

        database:
            process.env.STAGEPILOT_DB_NAME,

        max:
            2
    });


const db =
    await pool.connect();


const stamp =
    `${Date.now()}-${process.pid}`;


const repositoryName =
    `stagepilot-w04-package-${stamp}`;


const workspace =
    `${workspaceRoot}/s06-w04-${stamp}`;


const keyDirectory =
    `${acceptanceRoot}/s06-w04-${stamp}`;


const keyPath =
    `${keyDirectory}/deploy-key`;


const publicKeyPath =
    `${keyPath}.pub`;


let temporaryProjectId =
    null;


let remoteRepositoryCreated =
    false;


const report = {
    package: {},
    commit: {},
    remote: {},
    cleanup: {}
};


function requireCondition(
    condition,
    message
) {

    if (!condition) {

        throw new Error(
            message
        );

    }

}


function spawnCommand(
    command,
    args,
    {
        cwd,
        env = {}
    } = {}
) {

    return new Promise(
        (
            resolvePromise,
            rejectPromise
        ) => {

            const child =
                spawn(
                    command,
                    args,
                    {
                        cwd,

                        env: {
                            PATH:
                                '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',

                            HOME:
                                cwd
                                ??
                                workspace,

                            LANG:
                                'C.UTF-8',

                            LC_ALL:
                                'C.UTF-8',

                            GIT_TERMINAL_PROMPT:
                                '0',

                            ...env
                        },

                        stdio: [
                            'ignore',
                            'pipe',
                            'pipe'
                        ]
                    }
                );


            let stdout = '';
            let stderr = '';


            child.stdout.on(
                'data',
                chunk => {

                    stdout +=
                        chunk.toString(
                            'utf8'
                        );

                }
            );


            child.stderr.on(
                'data',
                chunk => {

                    stderr +=
                        chunk.toString(
                            'utf8'
                        );

                }
            );


            child.once(
                'error',
                rejectPromise
            );


            child.once(
                'close',
                code => {

                    resolvePromise({
                        code:
                            Number(
                                code
                                ??
                                1
                            ),

                        stdout,

                        stderr
                    });

                }
            );

        }
    );

}


async function runRequired(
    command,
    args,
    options,
    errorCode
) {

    const result =
        await spawnCommand(
            command,
            args,
            options
        );


    if (
        result.code
        !==
        0
    ) {

        const error =
            new Error(
                `${errorCode}:${result.code}`
            );


        error.stderr =
            result.stderr;


        throw error;

    }


    return result.stdout.trim();

}


async function git(
    args,
    {
        sshCommand = null
    } = {}
) {

    const env = {};


    if (
        sshCommand
    ) {

        env.GIT_SSH_COMMAND =
            sshCommand;

    }


    return runRequired(
        '/usr/bin/git',
        [
            '-C',
            workspace,
            ...args
        ],
        {
            cwd:
                workspace,

            env
        },
        'GIT_COMMAND_FAILED'
    );

}


async function ensureRepositoryAbsent() {

    const lookup =
        await getRepository(
            secretRef,
            owner,
            repositoryName
        );


    requireCondition(
        lookup.status
        ===
        404,

        'TEMP_REPOSITORY_ALREADY_EXISTS'
    );

}


async function deleteRemoteRepository() {

    const lookup =
        await getRepository(
            secretRef,
            owner,
            repositoryName
        );


    if (
        lookup.status
        ===
        404
    ) {

        return true;

    }


    requireCondition(
        lookup.ok,
        `REMOTE_CLEANUP_LOOKUP_FAILED:${lookup.status}`
    );


    const deleted =
        await deleteRepository(
            secretRef,
            owner,
            repositoryName
        );


    requireCondition(
        deleted.status
        ===
        204,

        `REMOTE_DELETE_FAILED:${deleted.status}`
    );


    for (
        let attempt = 1;
        attempt <= 10;
        attempt += 1
    ) {

        const after =
            await getRepository(
                secretRef,
                owner,
                repositoryName
            );


        if (
            after.status
            ===
            404
        ) {

            return true;

        }


        await new Promise(
            resolve =>
                setTimeout(
                    resolve,
                    750
                )
        );

    }


    throw new Error(
        'REMOTE_DELETE_NOT_CONFIRMED'
    );

}


async function writePackageFiles(
    files
) {

    for (
        const [
            relativePath,
            content
        ]
        of Object.entries(
            files
        )
    ) {

        const destination =
            join(
                workspace,
                relativePath
            );


        await mkdir(
            dirname(
                destination
            ),
            {
                recursive:
                    true
            }
        );


        await writeFile(
            destination,
            content,
            'utf8'
        );

    }

}


async function verifyRemoteFile(
    filePath,
    expectedContent
) {

    const encodedPath =
        filePath
            .split(
                '/'
            )
            .map(
                segment =>
                    encodeURIComponent(
                        segment
                    )
            )
            .join(
                '/'
            );


    const response =
        await githubRequest({
            secretRef,

            path:
                `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repositoryName)}/contents/${encodedPath}?ref=main`
        });


    requireCondition(
        response.ok,
        `REMOTE_FILE_LOOKUP_FAILED:${filePath}:${response.status}`
    );


    requireCondition(
        response.data?.type
        ===
        'file',

        `REMOTE_PATH_NOT_FILE:${filePath}`
    );


    const content =
        Buffer.from(
            String(
                response.data?.content
                ??
                ''
            ).replace(
                /\s/g,
                ''
            ),
            'base64'
        ).toString(
            'utf8'
        );


    requireCondition(
        content
        ===
        expectedContent,

        `REMOTE_FILE_CONTENT_MISMATCH:${filePath}`
    );


    return true;

}


let mainError =
    null;


try {

    // ========================================================
    // A. CREATE TEMPORARY PROJECT + PLAN
    // ========================================================

    const projectResult =
        await db.query(
            `
            INSERT INTO projects (
                slug,
                name,
                description,
                status,
                current_plan_revision,
                settings
            )
            VALUES (
                $1,
                $2,
                $3,
                'draft',
                1,
                $4::jsonb
            )
            RETURNING *
            `,
            [
                `stagepilot-s06-w04-${stamp}`,

                'StagePilot S06/W04 Initial Package Acceptance',

                'Temporary project proving the initial GitHub repository package lifecycle.',

                JSON.stringify({
                    internal:
                        true,

                    acceptanceOnly:
                        true,

                    language:
                        'fa',

                    serverHost:
                        'must-not-leak',

                    credential:
                        'must-not-leak'
                })
            ]
        );


    const project =
        projectResult.rows[0];


    temporaryProjectId =
        project.id;


    const plan = {
        schemaVersion:
            1,

        title:
            'StagePilot S06/W04 Acceptance Plan',

        stages: [
            {
                id:
                    'S01',

                title:
                    'Acceptance Foundation',

                works: [
                    {
                        id:
                            'S01-W01',

                        title:
                            'Initial repository package',

                        acceptanceCriteria: [
                            'README exists',
                            'Project JSON exists',
                            'Plan JSON exists',
                            'Sanitized gitignore exists'
                        ]
                    }
                ]
            }
        ],

        runtimePath:
            '/opt/stagepilot/runtime/must-not-leak',

        githubToken:
            'must-not-leak'
    };


    await db.query(
        `
        INSERT INTO project_revisions (
            project_id,
            revision,
            source,
            request_text,
            plan_json,
            approved,
            approved_at
        )
        VALUES (
            $1,
            1,
            'manager',
            'S06/W04 live acceptance fixture',
            $2::jsonb,
            true,
            now()
        )
        `,
        [
            project.id,
            JSON.stringify(
                plan
            )
        ]
    );


    // ========================================================
    // B. CREATE EMPTY PRIVATE GITHUB REPOSITORY
    // ========================================================

    await ensureRepositoryAbsent();


    const created =
        await createRepository(
            secretRef,
            {
                name:
                    repositoryName,

                description:
                    'Temporary StagePilot S06/W04 initial package acceptance repository.',

                isPrivate:
                    true
            }
        );


    requireCondition(
        created.status
        ===
        201,

        `REMOTE_REPOSITORY_CREATE_FAILED:${created.status}`
    );


    requireCondition(
        created.data?.private
        ===
        true,

        'TEMP_REPOSITORY_NOT_PRIVATE'
    );


    requireCondition(
        String(
            created.data?.owner?.login
            ??
            ''
        ).toLowerCase()
        ===
        owner.toLowerCase(),

        'TEMP_REPOSITORY_OWNER_MISMATCH'
    );


    remoteRepositoryCreated =
        true;


    // ========================================================
    // C. CREATE UNIQUE DEPLOY KEY FOR THIS REPOSITORY
    // ========================================================

    await mkdir(
        keyDirectory,
        {
            recursive:
                true
        }
    );


    await chmod(
        keyDirectory,
        0o700
    );


    await runRequired(
        '/usr/bin/ssh-keygen',
        [
            '-q',
            '-t',
            'ed25519',
            '-N',
            '',
            '-C',
            `stagepilot-w04-${stamp}`,
            '-f',
            keyPath
        ],
        {
            cwd:
                keyDirectory
        },
        'SSH_KEYGEN_FAILED'
    );


    await chmod(
        keyPath,
        0o600
    );


    const publicKey =
        (
            await readFile(
                publicKeyPath,
                'utf8'
            )
        ).trim();


    requireCondition(
        publicKey.startsWith(
            'ssh-ed25519 '
        ),

        'PUBLIC_KEY_INVALID'
    );


    const keyResponse =
        await githubRequest({
            secretRef,

            method:
                'POST',

            path:
                `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repositoryName)}/keys`,

            body: {
                title:
                    `StagePilot W04 ${stamp}`,

                key:
                    publicKey,

                read_only:
                    false
            }
        });


    requireCondition(
        keyResponse.status
        ===
        201,

        `DEPLOY_KEY_CREATE_FAILED:${keyResponse.status}`
    );


    // ========================================================
    // D. GENERATE SANITIZED INITIAL PACKAGE
    // ========================================================

    const packageResult =
        createInitialRepositoryPackage({

            project: {
                id:
                    project.id,

                slug:
                    project.slug,

                name:
                    project.name,

                description:
                    project.description,

                currentPlanRevision:
                    1,

                metadata:
                    project.settings
            },

            repository: {
                fullName:
                    `${owner}/${repositoryName}`,

                visibility:
                    'private',

                defaultBranch:
                    'main'
            },

            plan
        });


    requireCondition(
        Object.keys(
            packageResult.files
        ).length
        ===
        4,

        'INITIAL_PACKAGE_FILE_COUNT_INVALID'
    );


    const serializedPackage =
        Object.values(
            packageResult.files
        ).join(
            '\n'
        );


    requireCondition(
        !serializedPackage.includes(
            'must-not-leak'
        ),

        'SENSITIVE_FIXTURE_VALUE_LEAKED'
    );


    requireCondition(
        packageResult.safety.secretsIncluded
        ===
        false,

        'PACKAGE_SECRET_SAFETY_INVALID'
    );


    await mkdir(
        workspace,
        {
            recursive:
                true
        }
    );


    await writePackageFiles(
        packageResult.files
    );


    // ========================================================
    // E. LOCAL INITIAL COMMIT
    // ========================================================

    await git([
        'init',
        '-b',
        'main'
    ]);


    await git([
        'config',
        'user.name',
        'StagePilot'
    ]);


    await git([
        'config',
        'user.email',
        'stagepilot@localhost'
    ]);


    await git([
        'add',
        '--',
        '.gitignore',
        'README.md',
        'stagepilot/project.json',
        'stagepilot/plan.json'
    ]);


    const staged =
        (
            await git([
                'diff',
                '--cached',
                '--name-only'
            ])
        )
            .split(
                '\n'
            )
            .filter(
                Boolean
            )
            .sort();


    const expectedFiles =
        [
            '.gitignore',
            'README.md',
            'stagepilot/plan.json',
            'stagepilot/project.json'
        ].sort();


    requireCondition(
        JSON.stringify(
            staged
        )
        ===
        JSON.stringify(
            expectedFiles
        ),

        'LOCAL_STAGED_FILE_SET_INVALID'
    );


    await git([
        'commit',
        '-m',
        'StagePilot: initialize approved project'
    ]);


    const localSha =
        await git([
            'rev-parse',
            'HEAD'
        ]);


    const commitCount =
        await git([
            'rev-list',
            '--count',
            'HEAD'
        ]);


    requireCondition(
        commitCount
        ===
        '1',

        'INITIAL_REPOSITORY_MUST_HAVE_ONE_COMMIT'
    );


    const trackedFiles =
        (
            await git([
                'ls-tree',
                '-r',
                '--name-only',
                'HEAD'
            ])
        )
            .split(
                '\n'
            )
            .filter(
                Boolean
            )
            .sort();


    requireCondition(
        JSON.stringify(
            trackedFiles
        )
        ===
        JSON.stringify(
            expectedFiles
        ),

        'INITIAL_COMMIT_FILE_SET_INVALID'
    );


    const forbiddenTracked =
        trackedFiles.filter(
            item =>
                /(^|\/)(runtime|storage|browser-profiles|browser-sessions|logs)(\/|$)/i.test(
                    item
                )
                ||
                /\.env(?:\.|$)/i.test(
                    item
                )
                ||
                /\.(?:pem|key|p12|pfx|log)$/i.test(
                    item
                )
        );


    requireCondition(
        forbiddenTracked.length
        ===
        0,

        'FORBIDDEN_INITIAL_COMMIT_PATH'
    );


    // ========================================================
    // F. REAL FIRST PUSH
    // ========================================================

    const repositorySshUrl =
        created.data?.ssh_url;


    requireCondition(
        repositorySshUrl
        ===
        `git@github.com:${owner}/${repositoryName}.git`,

        'TEMP_REPOSITORY_SSH_URL_INVALID'
    );


    await git([
        'remote',
        'add',
        'origin',
        repositorySshUrl
    ]);


    const sshCommand =
        [
            '/usr/bin/ssh',

            '-i',
            keyPath,

            '-o',
            'IdentitiesOnly=yes',

            '-o',
            'BatchMode=yes',

            '-o',
            'StrictHostKeyChecking=accept-new',

            '-o',
            `UserKnownHostsFile=${knownHosts}`,

            '-o',
            'ConnectTimeout=15'
        ].join(
            ' '
        );


    await git(
        [
            'push',
            '-u',
            'origin',
            'main:main'
        ],
        {
            sshCommand
        }
    );


    // ========================================================
    // G. VERIFY DESTINATION SHA / BRANCH
    // ========================================================

    const lsRemote =
        await git(
            [
                'ls-remote',
                'origin',
                'refs/heads/main'
            ],
            {
                sshCommand
            }
        );


    const remoteSha =
        lsRemote
            .trim()
            .split(
                /\s+/
            )[0]
            ??
            '';


    requireCondition(
        remoteSha
        ===
        localSha,

        'REMOTE_SHA_MISMATCH'
    );


    const repositoryAfterPush =
        await getRepository(
            secretRef,
            owner,
            repositoryName
        );


    requireCondition(
        repositoryAfterPush.ok,
        `POST_PUSH_REPOSITORY_LOOKUP_FAILED:${repositoryAfterPush.status}`
    );


    requireCondition(
        repositoryAfterPush.data?.default_branch
        ===
        'main',

        `DEFAULT_BRANCH_NOT_MAIN:${repositoryAfterPush.data?.default_branch}`
    );


    // ========================================================
    // H. VERIFY EVERY FILE FROM GITHUB
    // ========================================================

    for (
        const [
            filePath,
            content
        ]
        of Object.entries(
            packageResult.files
        )
    ) {

        await verifyRemoteFile(
            filePath,
            content
        );

    }


    const commitsResponse =
        await githubRequest({
            secretRef,

            path:
                `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repositoryName)}/commits?sha=main&per_page=2`
        });


    requireCondition(
        commitsResponse.ok,
        `REMOTE_COMMIT_LOOKUP_FAILED:${commitsResponse.status}`
    );


    requireCondition(
        Array.isArray(
            commitsResponse.data
        ),

        'REMOTE_COMMIT_LIST_INVALID'
    );


    requireCondition(
        commitsResponse.data.length
        ===
        1,

        `EXPECTED_ONE_REMOTE_COMMIT:${commitsResponse.data.length}`
    );


    requireCondition(
        commitsResponse.data[0]?.sha
        ===
        localSha,

        'REMOTE_TOP_COMMIT_SHA_MISMATCH'
    );


    report.package = {
        fileCount:
            4,

        exactFileSet:
            true,

        sanitized:
            true,

        secretMaterialIncluded:
            false,

        serverLocalStateIncluded:
            false
    };


    report.commit = {
        localCommitCount:
            1,

        localSha,

        trackedFileCount:
            trackedFiles.length,

        forbiddenTrackedPaths:
            0
    };


    report.remote = {
        privateRepository:
            true,

        deployKeyWriteAccess:
            true,

        firstPush:
            true,

        branch:
            'main',

        remoteSha,

        shaMatches:
            remoteSha
            ===
            localSha,

        remoteCommitCount:
            1,

        filesVerified:
            4
    };


} catch (
    error
) {

    mainError =
        error;

} finally {

    const cleanupErrors = [];


    try {

        if (
            temporaryProjectId
        ) {

            await db.query(
                `
                DELETE FROM projects
                WHERE id=$1
                `,
                [
                    temporaryProjectId
                ]
            );

        }

    } catch (
        error
    ) {

        cleanupErrors.push(
            `PROJECT:${error?.message ?? error}`
        );

    }


    try {

        if (
            remoteRepositoryCreated
        ) {

            await deleteRemoteRepository();

        }

    } catch (
        error
    ) {

        cleanupErrors.push(
            `REPOSITORY:${error?.message ?? error}`
        );

    }


    try {

        if (
            workspace.startsWith(
                `${workspaceRoot}/s06-w04-`
            )
        ) {

            await rm(
                workspace,
                {
                    recursive:
                        true,

                    force:
                        true
                }
            );

        } else {

            throw new Error(
                'UNSAFE_WORKSPACE_CLEANUP_PATH'
            );

        }

    } catch (
        error
    ) {

        cleanupErrors.push(
            `WORKSPACE:${error?.message ?? error}`
        );

    }


    try {

        if (
            keyDirectory.startsWith(
                `${acceptanceRoot}/s06-w04-`
            )
        ) {

            await rm(
                keyDirectory,
                {
                    recursive:
                        true,

                    force:
                        true
                }
            );

        } else {

            throw new Error(
                'UNSAFE_KEY_CLEANUP_PATH'
            );

        }

    } catch (
        error
    ) {

        cleanupErrors.push(
            `KEY:${error?.message ?? error}`
        );

    }


    let projectDeleted =
        true;


    if (
        temporaryProjectId
    ) {

        try {

            const result =
                await db.query(
                    `
                    SELECT COUNT(*)::int AS count
                    FROM projects
                    WHERE id=$1
                    `,
                    [
                        temporaryProjectId
                    ]
                );


            projectDeleted =
                Number(
                    result.rows[0]?.count
                    ??
                    0
                )
                ===
                0;

        } catch {

            projectDeleted =
                false;

        }

    }


    let repositoryDeleted =
        true;


    try {

        const lookup =
            await getRepository(
                secretRef,
                owner,
                repositoryName
            );


        repositoryDeleted =
            lookup.status
            ===
            404;

    } catch {

        repositoryDeleted =
            false;

    }


    report.cleanup = {
        projectDeleted,
        repositoryDeleted,
        workspaceDeleted:
            true,
        deployKeyFilesDeleted:
            true,
        cleanupErrors
    };


    db.release();

    await pool.end();


    if (
        cleanupErrors.length > 0
        ||
        projectDeleted
        !==
        true
        ||
        repositoryDeleted
        !==
        true
    ) {

        if (!mainError) {

            mainError =
                new Error(
                    `LIVE_ACCEPTANCE_CLEANUP_FAILED:${cleanupErrors.join(';')}`
                );

        }

    }

}


if (
    mainError
) {

    process.stderr.write(
        JSON.stringify({
            error:
                mainError?.message
                ??
                String(
                    mainError
                ),

            report
        })
    );

    process.exit(
        1
    );

}


process.stdout.write(
    JSON.stringify({
        result:
            'PASS',

        package:
            report.package,

        commit:
            report.commit,

        remote:
            report.remote,

        cleanup:
            report.cleanup
    })
);

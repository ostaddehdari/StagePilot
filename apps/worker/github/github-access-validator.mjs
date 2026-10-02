import {
    stat
} from 'node:fs/promises';

import {
    spawn
} from 'node:child_process';

import {
    resolve
} from 'node:path';


const ALLOWED_SECRET_ROOT =
    '/opt/stagepilot/runtime/github';


function run(
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
                                '/opt/stagepilot/runtime/github',

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


export function parseFileSecretRef(
    secretRef
) {

    const value =
        String(
            secretRef
            ??
            ''
        );


    if (
        !value.startsWith(
            'file://'
        )
    ) {

        throw new Error(
            'SECRET_REF_MUST_USE_FILE_SCHEME'
        );

    }


    const path =
        resolve(
            value.slice(
                'file://'.length
            )
        );


    const allowed =
        resolve(
            ALLOWED_SECRET_ROOT
        );


    if (
        path !== allowed
        &&
        !path.startsWith(
            `${allowed}/`
        )
    ) {

        throw new Error(
            'SECRET_REF_OUTSIDE_ALLOWED_ROOT'
        );

    }


    return path;

}


export async function validateSecretFile(
    secretRef
) {

    const path =
        parseFileSecretRef(
            secretRef
        );


    const info =
        await stat(
            path
        );


    if (!info.isFile()) {

        throw new Error(
            'SECRET_REF_NOT_FILE'
        );

    }


    const mode =
        info.mode
        &
        0o777;


    if (
        (
            mode
            &
            0o077
        )
        !==
        0
    ) {

        throw new Error(
            'SECRET_FILE_PERMISSIONS_TOO_OPEN'
        );

    }


    return {

        exists:
            true,

        safePermissions:
            true,

        mode:
            mode.toString(
                8
            )

    };

}


export async function validateGitTransport({

    repoRoot,

    expectedOwner,

    expectedRepository,

    remoteUrl,

    secretRef,

    knownHosts

}) {

    const keyPath =
        parseFileSecretRef(
            secretRef
        );


    await validateSecretFile(
        secretRef
    );


    const expectedRemote =
        `git@github.com:${expectedOwner}/${expectedRepository}.git`;


    if (
        remoteUrl
        !==
        expectedRemote
    ) {

        throw new Error(
            'REMOTE_IDENTITY_MISMATCH'
        );

    }


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


    const transportEnv = {

        GIT_SSH_COMMAND:
            sshCommand

    };


    const read =
        await run(
            '/usr/bin/git',
            [
                '-C',
                repoRoot,

                'ls-remote',
                'origin',
                'refs/heads/main'
            ],
            {
                cwd:
                    repoRoot,

                env:
                    transportEnv
            }
        );


    if (
        read.code
        !==
        0
    ) {

        throw new Error(
            'GITHUB_REPOSITORY_READ_DENIED'
        );

    }


    const write =
        await run(
            '/usr/bin/git',
            [
                '-C',
                repoRoot,

                'push',
                '--dry-run',
                'origin',
                'main:main'
            ],
            {
                cwd:
                    repoRoot,

                env:
                    transportEnv
            }
        );


    if (
        write.code
        !==
        0
    ) {

        throw new Error(
            'GITHUB_REPOSITORY_WRITE_DENIED'
        );

    }


    const local =
        await run(
            '/usr/bin/git',
            [
                '-C',
                repoRoot,

                'rev-parse',
                'main'
            ],
            {
                cwd:
                    repoRoot
            }
        );


    if (
        local.code
        !==
        0
    ) {

        throw new Error(
            'LOCAL_MAIN_UNAVAILABLE'
        );

    }


    const remoteSha =
        read.stdout
            .trim()
            .split(
                /\s+/
            )[0]
            ??
            '';


    const localSha =
        local.stdout.trim();


    return {

        provider:
            'github',

        ownerLogin:
            expectedOwner,

        repository:
            `${expectedOwner}/${expectedRepository}`,

        remoteIdentityVerified:
            true,

        repositoryRead:
            true,

        repositoryWrite:
            true,

        repositoryCreateApi:
            false,

        repositoryCreateVerification:
            'deferred-until-api-credential',

        transport:
            'ssh-deploy-key',

        secretRefScheme:
            'file',

        secretValueExposed:
            false,

        localSha,

        remoteSha,

        destinationShaMatches:
            Boolean(
                remoteSha
            )
            &&
            remoteSha === localSha

    };

}


async function main() {

    const descriptorRaw =
        process.argv[2];


    if (!descriptorRaw) {

        throw new Error(
            'USAGE: github-access-validator.mjs DESCRIPTOR_JSON'
        );

    }


    const descriptor =
        JSON.parse(
            descriptorRaw
        );


    const result =
        await validateGitTransport(
            descriptor
        );


    process.stdout.write(
        JSON.stringify(
            result
        )
    );

}


if (
    process.argv[1]
    &&
    import.meta.url
        ===
        new URL(
            `file://${process.argv[1]}`
        ).href
) {

    main()
        .catch(
            error => {

                console.error(
                    error?.message
                    ??
                    String(error)
                );

                process.exit(
                    1
                );

            }
        );

}

import {
    chmod,
    mkdir,
    readFile,
    writeFile
} from 'node:fs/promises';

import {
    dirname,
    join,
    resolve
} from 'node:path';

import {
    spawn
} from 'node:child_process';

import {
    canRunScript
} from './execution-policy.mjs';


function assertInsideWorkspace(
    workspace,
    target
) {

    const base =
        resolve(workspace);

    const resolved =
        resolve(target);


    if (
        resolved !== base
        &&
        !resolved.startsWith(
            `${base}/`
        )
    ) {

        throw new Error(
            'WORKSPACE_ESCAPE'
        );

    }

}


function runProcess(
    executable,
    args,
    {
        cwd,
        timeoutMs
    }
) {

    return new Promise(
        (
            resolvePromise,
            rejectPromise
        ) => {

            const child =
                spawn(
                    executable,
                    args,
                    {
                        cwd,

                        env: {
                            PATH:
                                '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',

                            HOME:
                                cwd,

                            LANG:
                                'C.UTF-8',

                            LC_ALL:
                                'C.UTF-8'
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
            let timedOut = false;


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


            const timer =
                setTimeout(
                    () => {

                        timedOut = true;

                        child.kill(
                            'SIGTERM'
                        );

                    },
                    timeoutMs
                );


            child.once(
                'error',
                error => {

                    clearTimeout(
                        timer
                    );

                    rejectPromise(
                        error
                    );

                }
            );


            child.once(
                'close',
                (
                    code,
                    signal
                ) => {

                    clearTimeout(
                        timer
                    );


                    resolvePromise({

                        exitCode:
                            typeof code === 'number'
                                ? code
                                : null,

                        signal:
                            signal ?? null,

                        timedOut,

                        stdout,

                        stderr

                    });

                }
            );

        }
    );

}


export async function executeApprovedScript(
    {
        batchStatus,
        script,
        completedPositions,
        workspace,
        timeoutMs = 30000
    }
) {

    const decision =
        canRunScript({

            batchStatus,

            script,

            completedPositions

        });


    if (!decision.allowed) {

        return {

            executed:
                false,

            blocked:
                true,

            reason:
                decision.reason

        };

    }


    await mkdir(
        workspace,
        {
            recursive:
                true,
            mode:
                0o700
        }
    );


    const scriptPath =
        join(
            workspace,
            script.filename
        );


    assertInsideWorkspace(
        workspace,
        scriptPath
    );


    await mkdir(
        dirname(
            scriptPath
        ),
        {
            recursive:
                true,
            mode:
                0o700
        }
    );


    await writeFile(
        scriptPath,
        script.content,
        {
            encoding:
                'utf8',

            mode:
                0o700,

            flag:
                'wx'
        }
    );


    await chmod(
        scriptPath,
        0o700
    );


    const result =
        await runProcess(
            '/usr/bin/bash',
            [
                scriptPath
            ],
            {
                cwd:
                    workspace,

                timeoutMs
            }
        );


    return {

        executed:
            true,

        blocked:
            false,

        filename:
            script.filename,

        position:
            script.position,

        ...result

    };

}


async function cli() {

    const descriptorFile =
        process.argv[2];


    if (!descriptorFile) {

        throw new Error(
            'USAGE: safe-runner.mjs DESCRIPTOR_JSON'
        );

    }


    const descriptor =
        JSON.parse(
            await readFile(
                descriptorFile,
                'utf8'
            )
        );


    const result =
        await executeApprovedScript(
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

    cli()
        .catch(
            error => {

                console.error(
                    error?.stack
                    ??
                    String(error)
                );

                process.exit(
                    1
                );

            }
        );

}

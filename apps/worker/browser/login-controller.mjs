import {
    launchVisibleLoginRuntime
} from './login-runtime.mjs';


const profileKey =
    process.argv[2];


const accountId =
    process.argv[3]
    ||
    null;


const targetUrl =
    process.argv[4]
    ||
    'https://chatgpt.com/';


if (!profileKey) {

    throw new Error(
        'PROFILE_KEY_REQUIRED'
    );

}


let runtime =
    null;


let shuttingDown =
    false;


async function shutdown(
    code = 0
) {

    if (shuttingDown) {

        return;

    }


    shuttingDown =
        true;


    if (runtime) {

        await runtime.close()
            .catch(
                error => {

                    console.error(
                        'Runtime close error:',
                        error
                    );

                }
            );

    }


    process.exit(
        code
    );

}


process.on(
    'SIGTERM',
    () => {

        void shutdown(
            0
        );

    }
);


process.on(
    'SIGINT',
    () => {

        void shutdown(
            0
        );

    }
);


process.on(
    'SIGHUP',
    () => {

        void shutdown(
            0
        );

    }
);


process.on(
    'uncaughtException',
    error => {

        console.error(
            error
        );


        void shutdown(
            1
        );

    }
);


process.on(
    'unhandledRejection',
    error => {

        console.error(
            error
        );


        void shutdown(
            1
        );

    }
);


try {

    runtime =
        await launchVisibleLoginRuntime({

            profileKey,

            accountId,

            targetUrl

        });


    console.log(
        JSON.stringify({

            ok:
                true,

            status:
                'ready',

            profileKey,

            display:
                runtime.display,

            vncPort:
                runtime.vncPort,

            noVncPort:
                runtime.noVncPort

        })
    );


    await new Promise(
        () => {}
    );

} catch (error) {

    console.error(
        error
    );


    await shutdown(
        1
    );

}

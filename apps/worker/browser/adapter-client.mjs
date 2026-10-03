import {
    connect
} from 'node:net';


import {
    join
} from 'node:path';


const ADAPTER_ROOT =
    process.env
        .STAGEPILOT_BROWSER_ADAPTER_ROOT
    ??
    '/opt/stagepilot/runtime/browser-adapter';


const profileKey =
    process.argv[2];


const action =
    process.argv[3];


const payloadRaw =
    process.argv[4]
    ??
    '{}';


if (
    !profileKey
    ||
    !action
) {

    throw new Error(
        'USAGE: adapter-client.mjs PROFILE_KEY ACTION [JSON_PAYLOAD]'
    );

}


const allowed = [

    'health',

    'selectors',

    'inspect',

    'navigation',

    'conversations',

    'new-chat',

    'new-project',

    'open-target',

    'open-conversation',

    'send-state',

    'draft',

    'commit-send',

    'response-status',

    'response-dom-diagnostic',

    'targeted-dom-forensics',

    'wait-response',

    'find-conversation-title'

];


if (
    !allowed.includes(
        action
    )
) {

    throw new Error(
        'UNSUPPORTED_ADAPTER_ACTION'
    );

}


let payload;


try {

    payload =
        JSON.parse(
            payloadRaw
        );

} catch {

    throw new Error(
        'INVALID_JSON_PAYLOAD'
    );

}


const socketPath =
    join(
        ADAPTER_ROOT,
        `${profileKey}.sock`
    );


const request = {

    action,

    ...payload

};


const result =
    await new Promise(
        (
            resolve,
            reject
        ) => {

            const socket =
                connect(
                    socketPath
                );


            let buffer =
                '';


            const timer =
                setTimeout(
                    () => {

                        socket.destroy();


                        reject(
                            new Error(
                                'ADAPTER_RESPONSE_TIMEOUT'
                            )
                        );

                    },
                    190000
                );


            socket.setEncoding(
                'utf8'
            );


            socket.once(
                'connect',
                () => {

                    socket.write(
                        JSON.stringify(
                            request
                        )
                        +
                        '\n'
                    );

                }
            );


            socket.on(
                'data',
                chunk => {

                    buffer +=
                        chunk;

                }
            );


            socket.once(
                'error',
                error => {

                    clearTimeout(
                        timer
                    );


                    reject(
                        error
                    );

                }
            );


            socket.once(
                'end',
                () => {

                    clearTimeout(
                        timer
                    );


                    try {

                        resolve(
                            JSON.parse(
                                buffer.trim()
                            )
                        );

                    } catch {

                        reject(
                            new Error(
                                'INVALID_ADAPTER_RESPONSE'
                            )
                        );

                    }

                }
            );

        }
    );


console.log(
    JSON.stringify(
        result,
        null,
        2
    )
);


if (
    result?.ok
    !==
    true
) {

    process.exit(
        2
    );

}

import {
    createServer,
    request as httpRequest
} from 'node:http';


import {
    createHmac,
    timingSafeEqual
} from 'node:crypto';


import {
    readFile
} from 'node:fs/promises';


import {
    join
} from 'node:path';


const HOST =
    process.env.STAGEPILOT_NOVNC_GATEWAY_HOST
    ??
    '127.0.0.1';


const PORT =
    Number(
        process.env.STAGEPILOT_NOVNC_GATEWAY_PORT
        ??
        19110
    );


const SECRET =
    process.env.STAGEPILOT_NOVNC_GATEWAY_SECRET
    ??
    '';


const SESSION_ROOT =
    process.env.STAGEPILOT_BROWSER_SESSION_ROOT
    ??
    '/opt/stagepilot/runtime/browser-sessions';


const PORT_MIN =
    Number(
        process.env.STAGEPILOT_LOGIN_NOVNC_PORT_MIN
        ??
        16080
    );


const PORT_MAX =
    Number(
        process.env.STAGEPILOT_LOGIN_NOVNC_PORT_MAX
        ??
        16109
    );


if (
    SECRET.length < 64
) {

    throw new Error(
        'NOVNC_GATEWAY_SECRET_TOO_SHORT'
    );

}


function safeEqual(
    a,
    b
) {

    const aa =
        Buffer.from(
            a
        );


    const bb =
        Buffer.from(
            b
        );


    if (
        aa.length !== bb.length
    ) {

        return false;

    }


    return timingSafeEqual(
        aa,
        bb
    );

}


function pidAlive(
    pid
) {

    try {

        process.kill(
            Number(pid),
            0
        );


        return true;

    } catch (error) {

        return (
            error?.code
            ===
            'EPERM'
        );

    }

}


async function verifyToken(
    token
) {

    if (
        typeof token !== 'string'
        ||
        !token.includes('.')
    ) {

        throw new Error(
            'TOKEN_REQUIRED'
        );

    }


    const parts =
        token.split('.');


    if (
        parts.length !== 2
    ) {

        throw new Error(
            'TOKEN_FORMAT'
        );

    }


    const [
        body,
        signature
    ] = parts;


    const expected =
        createHmac(
            'sha256',
            SECRET
        )
            .update(
                body
            )
            .digest(
                'base64url'
            );


    if (
        !safeEqual(
            signature,
            expected
        )
    ) {

        throw new Error(
            'TOKEN_SIGNATURE'
        );

    }


    let payload;


    try {

        payload =
            JSON.parse(
                Buffer.from(
                    body,
                    'base64url'
                ).toString(
                    'utf8'
                )
            );

    } catch {

        throw new Error(
            'TOKEN_PAYLOAD'
        );

    }


    const now =
        Math.floor(
            Date.now()
            /
            1000
        );


    if (
        payload?.v !== 1
        ||
        typeof payload?.accountId !== 'string'
        ||
        typeof payload?.profileKey !== 'string'
        ||
        !Number.isInteger(payload?.noVncPort)
        ||
        !Number.isInteger(payload?.exp)
    ) {

        throw new Error(
            'TOKEN_FIELDS'
        );

    }


    if (
        payload.exp < now
    ) {

        throw new Error(
            'TOKEN_EXPIRED'
        );

    }


    if (
        payload.noVncPort < PORT_MIN
        ||
        payload.noVncPort > PORT_MAX
    ) {

        throw new Error(
            'TOKEN_PORT'
        );

    }


    if (
        !/^[a-zA-Z0-9][a-zA-Z0-9._-]{2,120}$/
            .test(
                payload.profileKey
            )
    ) {

        throw new Error(
            'TOKEN_PROFILE'
        );

    }


    const statePath =
        join(
            SESSION_ROOT,
            `${payload.profileKey}.json`
        );


    let state;


    try {

        state =
            JSON.parse(
                await readFile(
                    statePath,
                    'utf8'
                )
            );

    } catch {

        throw new Error(
            'SESSION_INACTIVE'
        );

    }


    if (
        state.status !== 'ready'
        ||
        state.profileKey !== payload.profileKey
        ||
        state.accountId !== payload.accountId
        ||
        Number(state.noVncPort) !== payload.noVncPort
        ||
        !pidAlive(
            state.controllerPid
        )
    ) {

        throw new Error(
            'SESSION_INACTIVE'
        );

    }


    return {
        payload,
        state
    };

}


function send(
    res,
    status,
    body,
    contentType = 'text/plain; charset=utf-8'
) {

    res.writeHead(
        status,
        {
            'content-type':
                contentType,

            'cache-control':
                'no-store',

            'referrer-policy':
                'no-referrer',

            'x-content-type-options':
                'nosniff',

            'x-frame-options':
                'SAMEORIGIN'
        }
    );


    res.end(
        body
    );

}


function viewerHtml() {

    return `<!doctype html>
<html lang="fa" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>StagePilot Secure noVNC</title>
<style>
html,body,#screen{margin:0;width:100%;height:100%;overflow:hidden;background:#111827}
#status{position:fixed;z-index:10;top:12px;right:12px;padding:8px 12px;border-radius:10px;background:rgba(15,23,42,.92);color:white;font:12px sans-serif}
#screen{position:absolute;inset:0}
</style>
</head>
<body>
<div id="status" data-state="connecting">Connecting…</div>
<div id="screen"></div>
<script type="module">
import RFB from "/StagePilot/novnc-assets/core/rfb.js";

const token = new URLSearchParams(location.search).get("token");
const status = document.getElementById("status");
const scheme = location.protocol === "https:" ? "wss" : "ws";
const wsUrl =
    scheme
    + "://"
    + location.host
    + "/StagePilot/novnc-gateway/ws?token="
    + encodeURIComponent(token || "");

const rfb = new RFB(
    document.getElementById("screen"),
    wsUrl
);

rfb.scaleViewport = true;
rfb.resizeSession = true;
rfb.focusOnClick = true;
rfb.viewOnly = false;

rfb.addEventListener("connect", () => {
    status.textContent = "Connected";
    status.dataset.state = "connected";
});

rfb.addEventListener("disconnect", event => {
    status.textContent =
        event.detail.clean
        ? "Disconnected"
        : "Connection lost";

    status.dataset.state = "disconnected";
});

rfb.addEventListener("securityfailure", () => {
    status.textContent = "Security failure";
    status.dataset.state = "error";
});
</script>
</body>
</html>`;

}


const server =
    createServer(
        async (
            req,
            res
        ) => {

            const url =
                new URL(
                    req.url
                    ??
                    '/',
                    `http://${HOST}:${PORT}`
                );


            if (
                url.pathname === '/health'
            ) {

                send(
                    res,
                    200,
                    JSON.stringify({
                        ok:
                            true,

                        service:
                            'stagepilot-novnc-gateway'
                    }),
                    'application/json; charset=utf-8'
                );


                return;

            }


            if (
                url.pathname !== '/view'
            ) {

                send(
                    res,
                    404,
                    'Not Found'
                );


                return;

            }


            try {

                await verifyToken(
                    url.searchParams.get(
                        'token'
                    )
                );


                send(
                    res,
                    200,
                    viewerHtml(),
                    'text/html; charset=utf-8'
                );

            } catch (error) {

                const message =
                    error instanceof Error
                    ? error.message
                    : 'UNAUTHORIZED';


                send(
                    res,
                    message === 'SESSION_INACTIVE'
                        ? 410
                        : 401,
                    message
                );

            }

        }
    );


server.on(
    'upgrade',
    async (
        req,
        socket,
        head
    ) => {

        try {

            const url =
                new URL(
                    req.url
                    ??
                    '/',
                    `http://${HOST}:${PORT}`
                );


            if (
                url.pathname !== '/ws'
            ) {

                socket.write(
                    'HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n'
                );

                socket.destroy();

                return;

            }


            const {
                payload
            } =
                await verifyToken(
                    url.searchParams.get(
                        'token'
                    )
                );


            const headers = {
                ...req.headers,

                host:
                    `127.0.0.1:${payload.noVncPort}`
            };


            const proxyRequest =
                httpRequest({

                    host:
                        '127.0.0.1',

                    port:
                        payload.noVncPort,

                    path:
                        '/',

                    method:
                        'GET',

                    headers

                });


            proxyRequest.on(
                'upgrade',
                (
                    proxyResponse,
                    proxySocket,
                    proxyHead
                ) => {

                    let response =
                        `HTTP/1.1 ${proxyResponse.statusCode} ${proxyResponse.statusMessage}\r\n`;


                    for (
                        let i = 0;
                        i < proxyResponse.rawHeaders.length;
                        i += 2
                    ) {

                        response +=
                            `${proxyResponse.rawHeaders[i]}: ${proxyResponse.rawHeaders[i + 1]}\r\n`;

                    }


                    response += '\r\n';


                    socket.write(
                        response
                    );


                    if (
                        proxyHead.length
                    ) {

                        socket.write(
                            proxyHead
                        );

                    }


                    if (
                        head.length
                    ) {

                        proxySocket.write(
                            head
                        );

                    }


                    proxySocket.pipe(
                        socket
                    );


                    socket.pipe(
                        proxySocket
                    );


                    proxySocket.on(
                        'error',
                        () =>
                            socket.destroy()
                    );


                    socket.on(
                        'error',
                        () =>
                            proxySocket.destroy()
                    );

                }
            );


            proxyRequest.on(
                'response',
                response => {

                    socket.write(
                        `HTTP/1.1 ${response.statusCode ?? 502} Bad Gateway\r\nConnection: close\r\n\r\n`
                    );

                    socket.destroy();

                }
            );


            proxyRequest.on(
                'error',
                () => {

                    socket.write(
                        'HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\n\r\n'
                    );

                    socket.destroy();

                }
            );


            proxyRequest.end();

        } catch (error) {

            const message =
                error instanceof Error
                ? error.message
                : 'UNAUTHORIZED';


            socket.write(
                message === 'SESSION_INACTIVE'
                    ? 'HTTP/1.1 410 Gone\r\nConnection: close\r\n\r\n'
                    : 'HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n'
            );


            socket.destroy();

        }

    }
);


server.listen(
    PORT,
    HOST,
    () => {

        console.log(
            JSON.stringify({
                ok:
                    true,

                host:
                    HOST,

                port:
                    PORT
            })
        );

    }
);

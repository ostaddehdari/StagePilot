import {
    createServer
} from 'node:http';


const HOST =
    '127.0.0.1';


const PORT =
    Number(
        process.argv[2]
        ??
        19112
    );


const server =
    createServer(
        (
            req,
            res
        ) => {

            if (
                req.url === '/health'
            ) {

                res.writeHead(
                    200,
                    {
                        'content-type':
                            'application/json'
                    }
                );


                res.end(
                    JSON.stringify({
                        ok:
                            true
                    })
                );


                return;

            }


            if (
                req.url === '/seed'
            ) {

                res.writeHead(
                    200,
                    {
                        'content-type':
                            'text/html; charset=utf-8',

                        'set-cookie':
                            'stagepilot_transition=verified; Path=/; Max-Age=3600; SameSite=Lax'
                    }
                );


                res.end(`
                    <!doctype html>
                    <html>
                    <head>
                        <title>Visible Seed</title>
                    </head>
                    <body>
                        <button data-testid="profile-button">
                            Account
                        </button>

                        <h1>
                            Visible profile seeded
                        </h1>
                    </body>
                    </html>
                `);


                return;

            }


            if (
                req.url === '/check'
            ) {

                const cookie =
                    req.headers.cookie
                    ??
                    '';


                const persisted =
                    cookie.includes(
                        'stagepilot_transition=verified'
                    );


                res.writeHead(
                    200,
                    {
                        'content-type':
                            'text/html; charset=utf-8'
                    }
                );


                if (persisted) {

                    res.end(`
                        <!doctype html>
                        <html>
                        <head>
                            <title>Cookie Persisted</title>
                        </head>
                        <body>
                            <button data-testid="profile-button">
                                Account
                            </button>

                            <h1>
                                Profile persisted
                            </h1>
                        </body>
                        </html>
                    `);

                } else {

                    res.end(`
                        <!doctype html>
                        <html>
                        <head>
                            <title>Cookie Missing</title>
                        </head>
                        <body>
                            <a href="/auth/login">
                                Log in
                            </a>
                        </body>
                        </html>
                    `);

                }


                return;

            }


            res.writeHead(
                404
            );


            res.end(
                'Not Found'
            );

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

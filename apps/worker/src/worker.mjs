const once = process.argv.includes('--once');


function emit() {

    process.stdout.write(

        JSON.stringify({

            ok: true,

            service: 'stagepilot-worker',

            stage: 'S07',

            work: 'W02',

            completionPackage: 'stage72',

            timestamp: new Date().toISOString()

        }) + '\n'

    );

}


emit();


if (!once) {

    setInterval(

        emit,

        60000

    );

}

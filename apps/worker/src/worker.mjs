const once = process.argv.includes('--once');


function emit() {

    process.stdout.write(

        JSON.stringify({

            ok: true,

            service: 'stagepilot-worker',

            stage: 'S01',

            work: 'W02',

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

import {
    Queue,
    Worker
} from 'bullmq';

import IORedis from 'ioredis';


const host =
    process.env.STAGEPILOT_REDIS_HOST;

const port =
    Number(
        process.env.STAGEPILOT_REDIS_PORT
    );

const password =
    process.env.STAGEPILOT_REDIS_PASSWORD;


if (
    !host
    ||
    !port
    ||
    !password
) {

    throw new Error(
        'StagePilot Redis environment is incomplete'
    );

}


const baseConnection = {

    host,

    port,

    password

};


const redis =
    new IORedis({

        ...baseConnection,

        maxRetriesPerRequest:
            2

    });


const ping =
    await redis.ping();


if (ping !== 'PONG') {

    throw new Error(
        'Redis ping failed'
    );

}


const queueName =
    `stagepilot-selftest-${process.pid}-${Date.now()}`;


const queue =
    new Queue(

        queueName,

        {

            connection:
                baseConnection,

            prefix:
                'stagepilot'

        }

    );


const worker =
    new Worker(

        queueName,

        async (job) => {

            return {

                ok:
                    true,

                jobId:
                    job.id,

                received:
                    job.data

            };

        },

        {

            connection: {

                ...baseConnection,

                maxRetriesPerRequest:
                    null

            },

            prefix:
                'stagepilot',

            concurrency:
                1

        }

    );


await worker.waitUntilReady();


let timer;


const completed =
    new Promise(
        (
            resolve,
            reject
        ) => {

            timer =
                setTimeout(
                    () => {

                        reject(
                            new Error(
                                'Queue self-test timed out'
                            )
                        );

                    },
                    15000
                );


            worker.once(
                'completed',
                (
                    job,
                    result
                ) => {

                    clearTimeout(timer);

                    resolve({

                        jobId:
                            job.id,

                        result

                    });

                }
            );


            worker.once(
                'failed',
                (
                    job,
                    error
                ) => {

                    clearTimeout(timer);

                    reject(
                        new Error(
                            `Queue job failed: ${job?.id ?? 'unknown'}: ${error.message}`
                        )
                    );

                }
            );

        }
    );


const job =
    await queue.add(

        'self-test',

        {

            stage:
                'S01',

            work:
                'W05',

            purpose:
                'queue-validation'

        },

        {

            removeOnComplete:
                true,

            removeOnFail:
                true

        }

    );


const result =
    await completed;


console.log(

    JSON.stringify({

        ok:
            true,

        redis:
            ping,

        queue:
            queueName,

        addedJobId:
            job.id,

        completedJobId:
            result.jobId,

        result:
            result.result

    })

);


await worker.close();

await queue.close();

await redis.quit();

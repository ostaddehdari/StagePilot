import 'reflect-metadata';


import {

    NestFactory

} from '@nestjs/core';


import {

    AppModule

} from './app.module';


async function bootstrap() {

    const app = await NestFactory.create(

        AppModule,

        {

            logger: [

                'error',

                'warn',

                'log'

            ]

        }

    );


    const port = Number(

        process.env.PORT || 19101

    );


    await app.listen(

        port,

        '127.0.0.1'

    );

}


bootstrap().catch((error) => {

    console.error(error);

    process.exit(1);

});

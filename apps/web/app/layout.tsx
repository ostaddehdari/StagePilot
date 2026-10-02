import 'bootstrap/dist/css/bootstrap.rtl.min.css';

import './stagepilot.css';

import type { Metadata } from 'next';


export const metadata: Metadata = {

    title: 'StagePilot',

    description: 'Stage and Work orchestration console'

};


export default function RootLayout({

    children

}: Readonly<{

    children: React.ReactNode

}>) {

    return (

        <html
            lang="fa"
            dir="rtl"
        >

            <body>

                {children}

            </body>

        </html>

    );

}

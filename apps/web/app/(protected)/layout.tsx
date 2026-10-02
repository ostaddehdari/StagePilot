import {
    cookies
} from 'next/headers';


import {
    redirect
} from 'next/navigation';


import {
    SESSION_COOKIE,
    verifySessionToken
} from '../../lib/auth';


import {
    Sidebar
} from '../../components/sidebar';


import {
    Topbar
} from '../../components/topbar';


export const dynamic =
    'force-dynamic';


export default async function ProtectedLayout({

    children

}: Readonly<{

    children: React.ReactNode;

}>) {


    const cookieStore =
        await cookies();


    const token =
        cookieStore
            .get(
                SESSION_COOKIE
            )
            ?.value;


    if (!verifySessionToken(token)) {

        redirect(
            '/login'
        );

    }


    return (

        <div
            className="
                stagepilot-app-shell
            "
        >

            <Sidebar />


            <div
                className="
                    stagepilot-main
                "
            >

                <Topbar />


                <main
                    className="
                        stagepilot-content
                    "
                >

                    {children}

                </main>

            </div>

        </div>

    );

}

'use client';


import Link from 'next/link';


import {
    usePathname
} from 'next/navigation';


type MenuItem = {

    label: string;

    subtitle: string;

    marker: string;

    icon: string;

    href?: string;

};


const menu: MenuItem[] = [

    {
        label:
            'داشبورد',

        subtitle:
            'نمای کلی سامانه',

        marker:
            '01',

        icon:
            'fa-solid fa-chart-pie',

        href:
            '/'
    },

    {
        label:
            'پروژه‌ها',

        subtitle:
            'Project / Stage / Work',

        marker:
            '02',

        icon:
            'fa-solid fa-diagram-project',

        href:
            '/projects'
    },

    {
        label:
            'حساب‌های ChatGPT',

        subtitle:
            'مرورگر و نشست‌ها',

        marker:
            '03',

        icon:
            'fa-brands fa-openai',

        href:
            '/chat-accounts'
    },

    {
        label:
            'اجراها',

        subtitle:
            'Prompt / Script / Run / Log',

        marker:
            '04',

        icon:
            'fa-solid fa-bolt',

        href:
            '/archive'
    },

    {
        label:
            'پرامپت‌ها',

        subtitle:
            'Templates / Requests',

        marker:
            '05',

        icon:
            'fa-solid fa-message',

        href:
            '/prompts'
    },

    {
        label:
            'لاگ‌ها',

        subtitle:
            'Server / Worker / Tests',

        marker:
            '06',

        icon:
            'fa-solid fa-terminal',

        href:
            '/logs'
    },

    {
        label:
            'Git',

        subtitle:
            'Repositories / Commits',

        marker:
            '07',

        icon:
            'fa-brands fa-github',

        href:
            '/git'
    },

    {
        label:
            'گزارش‌ها',

        subtitle:
            'Progress / Events',

        marker:
            '08',

        icon:
            'fa-solid fa-chart-line',

        href:
            '/reports'
    },

    {
        label:
            'تنظیمات',

        subtitle:
            'System configuration',

        marker:
            '09',

        icon:
            'fa-solid fa-gear',

        href:
            '/settings'
    }

];


function normalizedPath(
    pathname: string
) {

    const prefix =
        '/StagePilot';


    if (
        pathname === prefix
    ) {

        return '/';

    }


    if (
        pathname.startsWith(
            `${prefix}/`
        )
    ) {

        return (
            pathname.slice(
                prefix.length
            )
            ||
            '/'
        );

    }


    return pathname;

}


function NavigationItems() {

    const rawPath =
        usePathname();


    const pathname =
        normalizedPath(
            rawPath
        );


    return (

        <nav
            className="
                stagepilot-nav
            "
        >

            {menu.map(
                item => {

                    const active =
                        item.href
                        ?
                        (
                            item.href === '/'

                                ? pathname === '/'

                                :
                                (
                                    pathname
                                    ===
                                    item.href
                                    ||
                                    pathname.startsWith(
                                        `${item.href}/`
                                    )
                                )
                        )

                        :
                        false;


                    const content = (

                        <>

                            <div
                                className="
                                    stagepilot-nav-marker
                                "
                            >

                                <i className={item.icon} aria-hidden="true" />

                            </div>


                            <div
                                className="
                                    stagepilot-nav-copy
                                "
                            >

                                <div
                                    className="
                                        stagepilot-nav-label
                                    "
                                >

                                    {
                                        item.label
                                    }

                                </div>


                                <div
                                    className="
                                        stagepilot-nav-subtitle
                                    "
                                >

                                    {
                                        item.subtitle
                                    }

                                </div>

                            </div>

                        </>

                    );


                    if (!item.href) {

                        return (

                            <div
                                key={
                                    item.marker
                                }
                                className="
                                    stagepilot-nav-item
                                    stagepilot-nav-disabled
                                "
                            >

                                {content}

                            </div>

                        );

                    }


                    return (

                        <Link
                            key={
                                item.marker
                            }
                            href={
                                item.href
                            }
                            className={
                                active

                                    ? 'stagepilot-nav-item active'

                                    : 'stagepilot-nav-item'
                            }
                        >

                            {content}

                        </Link>

                    );

                }
            )}

        </nav>

    );

}


export function Sidebar() {

    return (

        <>

            <input
                id="stagepilot-sidebar-toggle"
                type="checkbox"
                className="stagepilot-sidebar-toggle-input"
            />

            <aside
                className="
                    stagepilot-sidebar
                    d-none
                    d-xl-flex
                "
            >

                <label
                    htmlFor="stagepilot-sidebar-toggle"
                    className="stagepilot-sidebar-toggle"
                    title="جمع یا باز کردن سایدبار"
                >
                    ⇄
                </label>

                <div>

                    <div
                        className="
                            stagepilot-brand
                        "
                    >

                        <div
                            className="
                                stagepilot-brand-mark
                            "
                        >

                            SP

                        </div>


                        <div>

                            <div
                                className="
                                    stagepilot-brand-title
                                "
                            >

                                StagePilot

                            </div>


                            <div
                                className="
                                    stagepilot-brand-subtitle
                                "
                            >

                                Project Orchestrator

                            </div>

                        </div>

                    </div>


                    <NavigationItems />

                </div>


                <div
                    className="
                        stagepilot-sidebar-footer
                    "
                >

                    <div
                        className="
                            stagepilot-status-dot
                        "
                    />


                    <div>

                        <div
                            className="
                                fw-semibold
                            "
                        >

                            Control Plane Online

                        </div>


                        <div
                            className="
                                small
                                opacity-75
                            "
                        >

                            Through Stage 7.2

                        </div>

                    </div>

                </div>

            </aside>


            <details
                className="
                    stagepilot-mobile-nav
                    d-xl-none
                "
            >

                <summary>

                    <span>
                        منوی StagePilot
                    </span>

                    <span>
                        ☰
                    </span>

                </summary>


                <div
                    className="
                        stagepilot-mobile-nav-body
                    "
                >

                    <NavigationItems />

                </div>

            </details>

        </>

    );

}

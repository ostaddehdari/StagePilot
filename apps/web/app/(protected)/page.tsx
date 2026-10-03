import {
    loadDashboardSummary
} from '../../lib/dashboard';


export const dynamic =
    'force-dynamic';


function numberFormat(
    value: number
) {

    return new Intl.NumberFormat(
        'fa-IR'
    ).format(
        value
    );

}


function eventLabel(
    type: string
) {

    const labels:
        Record<string, string> = {

        'foundation.database.ready':
            'پایگاه داده آماده شد',

        'foundation.storage_queue.ready':
            'Storage و Queue آماده شدند',

        'foundation.stage1.completed':
            'مرحلهٔ اول تکمیل شد'

    };


    return labels[type]
        ?? type;

}


export default async function DashboardPage() {

    const summary =
        await loadDashboardSummary();


    const counts =
        summary?.counts
        ?? {

            projects:
                0,

            stages:
                0,

            works:
                0,

            prompts:
                0,

            runs:
                0,

            events:
                0,

            active_runs:
                0

        };


    const cards = [

        {
            label:
                'پروژه‌ها',

            value:
                counts.projects,

            hint:
                'پروژه‌های ثبت‌شده',

            marker:
                'PRJ'
        },

        {
            label:
                'Stageها',

            value:
                counts.stages,

            hint:
                'مراحل پروژه‌ها',

            marker:
                'STG'
        },

        {
            label:
                'Workها',

            value:
                counts.works,

            hint:
                'کارهای اجرایی',

            marker:
                'WRK'
        },

        {
            label:
                'اجراهای فعال',

            value:
                counts.active_runs,

            hint:
                `${numberFormat(
                    counts.runs
                )} اجرای ثبت‌شده`,

            marker:
                'RUN'
        }

    ];


    return (

        <div>

            <section
                className="
                    stagepilot-hero
                "
            >

                <div>

                    <div
                        className="
                            stagepilot-hero-badge
                        "
                    >

                        Stage 7.2 Completion Package

                    </div>


                    <h2>

                        مدیریت هوشمند
                        چرخهٔ ساخت پروژه

                    </h2>


                    <p>

                        این پنل، وضعیت پروژه‌ها،
                        Stageها، Workها، پرامپت‌ها،
                        اسکریپت‌ها و اجرای سرور را
                        در یک مسیر واحد نگهداری،
                        پایش و قابل پیگیری می‌کند.

                    </p>

                </div>


                <div
                    className="
                        stagepilot-hero-status
                    "
                >

                    <div
                        className="
                            stagepilot-live-indicator
                        "
                    >

                        <span />

                        سامانه آنلاین است

                    </div>


                    <div
                        className="
                            small
                            mt-3
                            opacity-75
                        "
                    >

                        PostgreSQL · Redis · Worker

                    </div>

                </div>

            </section>


            {!summary && (

                <div
                    className="
                        alert
                        alert-warning
                        mt-4
                    "
                >

                    API داشبورد در دسترس نبود.
                    مقادیر فعلی با حالت fallback
                    نمایش داده شده‌اند.

                </div>

            )}


            <section
                className="
                    row
                    g-3
                    mt-1
                "
            >

                {cards.map(
                    (
                        card
                    ) => (

                        <div
                            className="
                                col-12
                                col-sm-6
                                col-xxl-3
                            "
                            key={
                                card.marker
                            }
                        >

                            <div
                                className="
                                    stagepilot-stat-card
                                "
                            >

                                <div
                                    className="
                                        stagepilot-stat-top
                                    "
                                >

                                    <span
                                        className="
                                            stagepilot-stat-marker
                                        "
                                    >

                                        {
                                            card.marker
                                        }

                                    </span>


                                    <span
                                        className="
                                            stagepilot-stat-label
                                        "
                                    >

                                        {
                                            card.label
                                        }

                                    </span>

                                </div>


                                <div
                                    className="
                                        stagepilot-stat-value
                                    "
                                >

                                    {
                                        numberFormat(
                                            card.value
                                        )
                                    }

                                </div>


                                <div
                                    className="
                                        stagepilot-stat-hint
                                    "
                                >

                                    {
                                        card.hint
                                    }

                                </div>

                            </div>

                        </div>

                    )
                )}

            </section>


            <section
                className="
                    row
                    g-4
                    mt-1
                "
            >

                <div
                    className="
                        col-12
                        col-xl-8
                    "
                >

                    <div
                        className="
                            stagepilot-panel
                            h-100
                        "
                    >

                        <div
                            className="
                                stagepilot-panel-header
                            "
                        >

                            <div>

                                <div
                                    className="
                                        stagepilot-panel-eyebrow
                                    "
                                >

                                    Timeline

                                </div>


                                <h3>

                                    رویدادهای اخیر

                                </h3>

                            </div>


                            <span
                                className="
                                    badge
                                    text-bg-light
                                "
                            >

                                {
                                    numberFormat(
                                        counts.events
                                    )
                                }

                                {' '}
                                رویداد

                            </span>

                        </div>


                        <div
                            className="
                                stagepilot-event-list
                            "
                        >

                            {
                                summary
                                &&
                                summary
                                    .recentEvents
                                    .length
                                >
                                0

                                ? (

                                    summary
                                        .recentEvents
                                        .map(
                                            (
                                                event
                                            ) => (

                                                <div
                                                    className="
                                                        stagepilot-event
                                                    "
                                                    key={
                                                        event.id
                                                    }
                                                >

                                                    <div
                                                        className="
                                                            stagepilot-event-dot
                                                        "
                                                    />


                                                    <div
                                                        className="
                                                            flex-grow-1
                                                        "
                                                    >

                                                        <div
                                                            className="
                                                                fw-semibold
                                                            "
                                                        >

                                                            {
                                                                eventLabel(
                                                                    event.event_type
                                                                )
                                                            }

                                                        </div>


                                                        <div
                                                            className="
                                                                small
                                                                text-secondary
                                                                mt-1
                                                            "
                                                        >

                                                            {
                                                                event.message
                                                                ??
                                                                event.event_type
                                                            }

                                                        </div>

                                                    </div>


                                                    <div
                                                        className="
                                                            stagepilot-event-id
                                                        "
                                                    >

                                                        #
                                                        {
                                                            event.id
                                                        }

                                                    </div>

                                                </div>

                                            )
                                        )

                                )

                                : (

                                    <div
                                        className="
                                            stagepilot-empty
                                        "
                                    >

                                        هنوز رویدادی ثبت نشده است.

                                    </div>

                                )
                            }

                        </div>

                    </div>

                </div>


                <div
                    className="
                        col-12
                        col-xl-4
                    "
                >

                    <div
                        className="
                            stagepilot-panel
                            h-100
                        "
                    >

                        <div
                            className="
                                stagepilot-panel-header
                            "
                        >

                            <div>

                                <div
                                    className="
                                        stagepilot-panel-eyebrow
                                    "
                                >

                                    Foundation

                                </div>


                                <h3>

                                    وضعیت زیرساخت

                                </h3>

                            </div>

                        </div>


                        <div
                            className="
                                stagepilot-health-list
                            "
                        >

                            {
                                [
                                    'Web Application',

                                    'NestJS API',

                                    'PostgreSQL',

                                    'Redis Queue',

                                    'Worker',

                                    'HTTPS / Nginx'
                                ].map(
                                    (
                                        item
                                    ) => (

                                        <div
                                            className="
                                                stagepilot-health-item
                                            "
                                            key={
                                                item
                                            }
                                        >

                                            <div>

                                                {
                                                    item
                                                }

                                            </div>


                                            <span>

                                                Online

                                            </span>

                                        </div>

                                    )
                                )
                            }

                        </div>


                        <div
                            className="
                                stagepilot-mini-summary
                            "
                        >

                            <div>

                                پرامپت‌های ثبت‌شده

                                <strong>

                                    {
                                        numberFormat(
                                            counts.prompts
                                        )
                                    }

                                </strong>

                            </div>


                            <div>

                                کل اجراها

                                <strong>

                                    {
                                        numberFormat(
                                            counts.runs
                                        )
                                    }

                                </strong>

                            </div>

                        </div>

                    </div>

                </div>

            </section>


            <section
                className="
                    stagepilot-next-step
                    mt-4
                "
            >

                <div>

                    <div
                        className="
                            stagepilot-panel-eyebrow
                        "
                    >

                        Next

                    </div>


                    <h3>

                        آماده برای ساخت اولین پروژه

                    </h3>


                    <p>

                        در Workهای بعدی، صفحهٔ
                        پروژه‌ها، درخت Stage/Work،
                        حساب‌های ChatGPT و آرشیو
                        کامل Prompt و Run به این
                        پوسته اضافه می‌شوند.

                    </p>

                </div>


                <div
                    className="
                        stagepilot-next-code
                    "
                >

                    S02 / W01

                </div>

            </section>

        </div>

    );

}

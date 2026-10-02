import Link from 'next/link';


import {
    notFound
} from 'next/navigation';


import {
    loadProject,
    loadProjectWorkspace
} from '../../../../lib/projects';


export const dynamic =
    'force-dynamic';


type ProjectPageProps = {

    params: Promise<{

        id: string;

    }>;

};


function numberFormat(
    value: number
) {

    return new Intl.NumberFormat(
        'fa-IR',
        {
            maximumFractionDigits:
                1
        }
    ).format(
        value
    );

}


function statusLabel(
    status: string
) {

    const labels:
        Record<string, string> = {

        pending:
            'در انتظار',

        ready:
            'آماده',

        running:
            'در حال اجرا',

        verifying:
            'در حال بررسی',

        completed:
            'تکمیل‌شده',

        blocked:
            'مسدود',

        failed:
            'ناموفق',

        paused:
            'متوقف',

        draft:
            'پیش‌نویس'

    };


    return labels[status]
        ??
        status;

}


function dateLabel(
    value: string
) {

    try {

        return new Intl.DateTimeFormat(
            'fa-IR',
            {
                dateStyle:
                    'medium',

                timeStyle:
                    'short'
            }
        ).format(
            new Date(
                value
            )
        );

    } catch {

        return value;

    }

}


export default async function ProjectPage({

    params

}: ProjectPageProps) {

    const {
        id
    } =
        await params;


    const [
        detail,
        workspace
    ] =
        await Promise.all([

            loadProject(
                id
            ),

            loadProjectWorkspace(
                id
            )

        ]);


    if (
        !detail
        ||
        !workspace
    ) {

        notFound();

    }


    const {
        project,
        revision
    } =
        detail;


    return (

        <div>

            <div
                className="
                    stagepilot-back-row
                "
            >

                <Link
                    href="/projects"
                    className="
                        stagepilot-back-link
                    "
                >

                    ← بازگشت به پروژه‌ها

                </Link>

            </div>


            <div
                className="
                    stagepilot-project-tools
                "
            >

                <Link
                    href={`/projects/${id}/chat`}
                    className="
                        btn
                        btn-sm
                        btn-outline-dark
                    "
                >

                    مدیریت ChatGPT پروژه

                </Link>

            </div>


            <section
                className="
                    stagepilot-project-header
                "
            >

                <div>

                    <div
                        className="
                            stagepilot-project-slug
                        "
                    >

                        {
                            project.slug
                        }

                    </div>


                    <h2>

                        {
                            project.name
                        }

                    </h2>


                    <p>

                        {
                            project.description
                            ||
                            'توضیح کوتاهی برای پروژه ثبت نشده است.'
                        }

                    </p>

                </div>


                <div
                    className="
                        stagepilot-project-progress-box
                    "
                >

                    <strong>

                        {
                            numberFormat(
                                workspace
                                    .verifiedProgress
                            )
                        }

                        ٪

                    </strong>


                    <span>

                        پیشرفت تأییدشده

                    </span>

                </div>

            </section>


            <section
                className="
                    row
                    g-3
                    mt-1
                "
            >

                {
                    [
                        [
                            'Stage',
                            workspace
                                .totals
                                .stages
                        ],

                        [
                            'Work',
                            workspace
                                .totals
                                .works
                        ],

                        [
                            'Work کامل',
                            workspace
                                .totals
                                .completedWorks
                        ],

                        [
                            'SubWork',
                            workspace
                                .totals
                                .subworks
                        ]
                    ].map(
                        (
                            [
                                label,
                                value
                            ]
                        ) => (

                            <div
                                className="
                                    col-6
                                    col-xl-3
                                "
                                key={
                                    label
                                }
                            >

                                <div
                                    className="
                                        stagepilot-project-metric
                                    "
                                >

                                    <span>

                                        {
                                            label
                                        }

                                    </span>


                                    <strong>

                                        {
                                            numberFormat(
                                                Number(
                                                    value
                                                )
                                            )
                                        }

                                    </strong>

                                </div>

                            </div>

                        )
                    )
                }

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
                        col-xxl-8
                    "
                >

                    <div
                        className="
                            stagepilot-panel
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

                                    Execution Plan

                                </div>


                                <h3>

                                    درخت Stage و Work

                                </h3>

                            </div>


                            <span
                                className="
                                    badge
                                    text-bg-light
                                "
                            >

                                Revision

                                {' '}

                                {
                                    numberFormat(
                                        workspace
                                            .currentRevision
                                    )
                                }

                            </span>

                        </div>


                        {
                            workspace
                                .stages
                                .length
                            ===
                            0

                            ? (

                                <div
                                    className="
                                        stagepilot-project-empty
                                        stagepilot-tree-empty
                                    "
                                >

                                    <div
                                        className="
                                            stagepilot-project-empty-mark
                                        "
                                    >

                                        S

                                    </div>


                                    <h4>

                                        هنوز Stage ساخته نشده

                                    </h4>


                                    <p>

                                        در مرحلهٔ Planning،
                                        درخواست اصلی پروژه
                                        به Stage و Work
                                        تبدیل خواهد شد.

                                    </p>

                                </div>

                            )

                            : (

                                <div
                                    className="
                                        stagepilot-stage-tree
                                    "
                                >

                                    {
                                        workspace
                                            .stages
                                            .map(
                                                stage => (

                                                    <section
                                                        className="
                                                            stagepilot-stage-node
                                                        "
                                                        key={
                                                            stage.id
                                                        }
                                                    >

                                                        <div
                                                            className="
                                                                stagepilot-stage-head
                                                            "
                                                        >

                                                            <div>

                                                                <div
                                                                    className="
                                                                        stagepilot-tree-key
                                                                    "
                                                                >

                                                                    {
                                                                        stage.stage_key
                                                                    }

                                                                </div>


                                                                <h4>

                                                                    {
                                                                        stage.title
                                                                    }

                                                                </h4>


                                                                {
                                                                    stage.description
                                                                    &&
                                                                    (

                                                                        <p>

                                                                            {
                                                                                stage.description
                                                                            }

                                                                        </p>

                                                                    )
                                                                }

                                                            </div>


                                                            <span
                                                                className={`
                                                                    stagepilot-state-badge
                                                                    state-${stage.status}
                                                                `}
                                                            >

                                                                {
                                                                    statusLabel(
                                                                        stage.status
                                                                    )
                                                                }

                                                            </span>

                                                        </div>


                                                        <div
                                                            className="
                                                                stagepilot-work-list
                                                            "
                                                        >

                                                            {
                                                                stage
                                                                    .works
                                                                    .length
                                                                ===
                                                                0

                                                                ? (

                                                                    <div
                                                                        className="
                                                                            stagepilot-tree-note
                                                                        "
                                                                    >

                                                                        این Stage هنوز Work ندارد.

                                                                    </div>

                                                                )

                                                                : (

                                                                    stage
                                                                        .works
                                                                        .map(
                                                                            work => (

                                                                                <article
                                                                                    className="
                                                                                        stagepilot-work-node
                                                                                    "
                                                                                    key={
                                                                                        work.id
                                                                                    }
                                                                                >

                                                                                    <div
                                                                                        className="
                                                                                            stagepilot-work-main
                                                                                        "
                                                                                    >

                                                                                        <div
                                                                                            className="
                                                                                                stagepilot-tree-key
                                                                                            "
                                                                                        >

                                                                                            {
                                                                                                work.work_key
                                                                                            }

                                                                                        </div>


                                                                                        <div
                                                                                            className="
                                                                                                stagepilot-work-copy
                                                                                            "
                                                                                        >

                                                                                            <h5>

                                                                                                {
                                                                                                    work.title
                                                                                                }

                                                                                            </h5>


                                                                                            {
                                                                                                work.description
                                                                                                &&
                                                                                                (

                                                                                                    <p>

                                                                                                        {
                                                                                                            work.description
                                                                                                        }

                                                                                                    </p>

                                                                                                )
                                                                                            }


                                                                                            <div
                                                                                                className="
                                                                                                    stagepilot-work-meta
                                                                                                "
                                                                                            >

                                                                                                <span>

                                                                                                    وزن:

                                                                                                    {' '}

                                                                                                    {
                                                                                                        numberFormat(
                                                                                                            work.weight
                                                                                                        )
                                                                                                    }

                                                                                                </span>


                                                                                                <span>

                                                                                                    SubWork:

                                                                                                    {' '}

                                                                                                    {
                                                                                                        numberFormat(
                                                                                                            work
                                                                                                                .subworks
                                                                                                                .length
                                                                                                        )
                                                                                                    }

                                                                                                </span>

                                                                                            </div>

                                                                                        </div>


                                                                                        <span
                                                                                            className={`
                                                                                                stagepilot-state-badge
                                                                                                state-${work.status}
                                                                                            `}
                                                                                        >

                                                                                            {
                                                                                                statusLabel(
                                                                                                    work.status
                                                                                                )
                                                                                            }

                                                                                        </span>

                                                                                    </div>


                                                                                    {
                                                                                        work
                                                                                            .subworks
                                                                                            .length
                                                                                        >
                                                                                        0
                                                                                        &&
                                                                                        (

                                                                                            <div
                                                                                                className="
                                                                                                    stagepilot-subwork-list
                                                                                                "
                                                                                            >

                                                                                                {
                                                                                                    work
                                                                                                        .subworks
                                                                                                        .map(
                                                                                                            subwork => (

                                                                                                                <div
                                                                                                                    className="
                                                                                                                        stagepilot-subwork
                                                                                                                    "
                                                                                                                    key={
                                                                                                                        subwork.id
                                                                                                                    }
                                                                                                                >

                                                                                                                    <div>

                                                                                                                        <span
                                                                                                                            className="
                                                                                                                                stagepilot-tree-key
                                                                                                                            "
                                                                                                                        >

                                                                                                                            {
                                                                                                                                subwork.subwork_key
                                                                                                                            }

                                                                                                                        </span>


                                                                                                                        <strong>

                                                                                                                            {
                                                                                                                                subwork.title
                                                                                                                            }

                                                                                                                        </strong>

                                                                                                                    </div>


                                                                                                                    <span
                                                                                                                        className={`
                                                                                                                            stagepilot-state-badge
                                                                                                                            state-${subwork.status}
                                                                                                                        `}
                                                                                                                    >

                                                                                                                        {
                                                                                                                            statusLabel(
                                                                                                                                subwork.status
                                                                                                                            )
                                                                                                                        }

                                                                                                                    </span>

                                                                                                                </div>

                                                                                                            )
                                                                                                        )
                                                                                                }

                                                                                            </div>

                                                                                        )
                                                                                    }

                                                                                </article>

                                                                            )
                                                                        )

                                                                )
                                                            }

                                                        </div>

                                                    </section>

                                                )
                                            )
                                    }

                                </div>

                            )
                        }

                    </div>

                </div>


                <div
                    className="
                        col-12
                        col-xxl-4
                    "
                >

                    <div
                        className="
                            stagepilot-panel
                            mb-4
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

                                    Revision History

                                </div>


                                <h3>

                                    تاریخچهٔ برنامه

                                </h3>

                            </div>

                        </div>


                        <div
                            className="
                                stagepilot-revision-list
                            "
                        >

                            {
                                workspace
                                    .revisions
                                    .map(
                                        item => (

                                            <div
                                                className="
                                                    stagepilot-revision-item
                                                "
                                                key={
                                                    item.id
                                                }
                                            >

                                                <div>

                                                    <strong>

                                                        Revision

                                                        {' '}

                                                        {
                                                            numberFormat(
                                                                item.revision
                                                            )
                                                        }

                                                    </strong>


                                                    <small>

                                                        {
                                                            item.source
                                                        }

                                                    </small>

                                                </div>


                                                <div
                                                    className="
                                                        text-end
                                                    "
                                                >

                                                    <span
                                                        className={
                                                            item.approved

                                                                ? 'stagepilot-revision-approved'

                                                                : 'stagepilot-revision-draft'
                                                        }
                                                    >

                                                        {
                                                            item.approved

                                                                ? 'تأییدشده'

                                                                : 'در انتظار تأیید'
                                                        }

                                                    </span>


                                                    <small>

                                                        {
                                                            dateLabel(
                                                                item.created_at
                                                            )
                                                        }

                                                    </small>

                                                </div>

                                            </div>

                                        )
                                    )
                            }

                        </div>

                    </div>


                    <div
                        className="
                            stagepilot-panel
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

                                    Project Timeline

                                </div>


                                <h3>

                                    Timeline پروژه

                                </h3>

                            </div>

                        </div>


                        <div
                            className="
                                stagepilot-project-timeline
                            "
                        >

                            {
                                workspace
                                    .events
                                    .length
                                ===
                                0

                                ? (

                                    <div
                                        className="
                                            stagepilot-tree-note
                                        "
                                    >

                                        رویدادی برای این پروژه ثبت نشده است.

                                    </div>

                                )

                                : (

                                    workspace
                                        .events
                                        .map(
                                            event => (

                                                <div
                                                    className="
                                                        stagepilot-timeline-event
                                                    "
                                                    key={
                                                        String(
                                                            event.id
                                                        )
                                                    }
                                                >

                                                    <div
                                                        className="
                                                            stagepilot-timeline-dot
                                                        "
                                                    />


                                                    <div>

                                                        <strong>

                                                            {
                                                                event.event_type
                                                            }

                                                        </strong>


                                                        <p>

                                                            {
                                                                event.message
                                                                ||
                                                                'بدون توضیح'
                                                            }

                                                        </p>


                                                        <small>

                                                            {
                                                                dateLabel(
                                                                    event.created_at
                                                                )
                                                            }

                                                        </small>

                                                    </div>

                                                </div>

                                            )
                                        )

                                )
                            }

                        </div>

                    </div>

                </div>

            </section>


            <section
                className="
                    stagepilot-panel
                    mt-4
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

                            Original Request

                        </div>


                        <h3>

                            درخواست اصلی پروژه

                        </h3>

                    </div>


                    <span
                        className="
                            badge
                            text-bg-light
                        "
                    >

                        Revision

                        {' '}

                        {
                            numberFormat(
                                revision?.revision
                                ??
                                0
                            )
                        }

                    </span>

                </div>


                <div
                    className="
                        stagepilot-request-view
                    "
                >

                    {
                        revision?.request_text
                        ||
                        'متن درخواست موجود نیست.'
                    }

                </div>

            </section>

        </div>

    );

}

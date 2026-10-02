import Link from 'next/link';


import {
    loadArchiveSummary
} from '../../../lib/archive';


export const dynamic =
    'force-dynamic';


function n(
    value: unknown
) {

    return new Intl.NumberFormat(
        'fa-IR'
    ).format(
        Number(
            value ?? 0
        )
    );

}


function text(
    value: unknown
) {

    if (
        typeof value
        !==
        'string'
    ) {

        return '—';

    }


    return value;

}


export default async function ArchivePage() {

    const archive =
        await loadArchiveSummary();


    const cards = [

        [
            'Prompt',
            archive.counts.prompts
        ],

        [
            'Response',
            archive.counts.responses
        ],

        [
            'Script',
            archive.counts.scripts
        ],

        [
            'Run',
            archive.counts.runs
        ],

        [
            'Log',
            archive.counts.logs
        ],

        [
            'Test',
            archive.counts.test_results
        ],

        [
            'Git',
            archive.counts.git_operations
        ]

    ];


    return (

        <div>

            <section
                className="
                    stagepilot-section-heading
                "
            >

                <div>

                    <div
                        className="
                            stagepilot-panel-eyebrow
                        "
                    >

                        Execution Archive

                    </div>


                    <h2>

                        آرشیو اجرای StagePilot

                    </h2>


                    <p>

                        مسیر کامل از پرامپت تا پاسخ،
                        اسکریپت، اجرای سرور، لاگ،
                        آزمون و عملیات Git در این
                        قسمت قابل پیگیری است.

                    </p>

                </div>

            </section>


            <section
                className="
                    stagepilot-archive-metrics
                    mt-3
                "
            >

                {
                    cards.map(
                        (
                            [
                                label,
                                value
                            ]
                        ) => (

                            <div
                                className="
                                    stagepilot-archive-metric
                                "
                                key={
                                    String(
                                        label
                                    )
                                }
                            >

                                <span>

                                    {
                                        label
                                    }

                                </span>


                                <strong>

                                    {
                                        n(
                                            value
                                        )
                                    }

                                </strong>

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
                        col-xl-6
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

                                    Prompt Requests

                                </div>


                                <h3>

                                    پرامپت‌های اخیر

                                </h3>

                            </div>

                        </div>


                        <div
                            className="
                                stagepilot-archive-list
                            "
                        >

                            {
                                archive
                                    .recentPrompts
                                    .length
                                ===
                                0

                                ? (

                                    <div
                                        className="
                                            stagepilot-tree-note
                                        "
                                    >

                                        هنوز پرامپتی ثبت نشده است.

                                    </div>

                                )

                                :

                                archive
                                    .recentPrompts
                                    .map(
                                        item => (

                                            <Link
                                                href={
                                                    `/archive/prompts/${item.id}`
                                                }
                                                className="
                                                    stagepilot-archive-row
                                                "
                                                key={
                                                    String(
                                                        item.id
                                                    )
                                                }
                                            >

                                                <div>

                                                    <code>

                                                        {
                                                            text(
                                                                item.request_key
                                                            )
                                                        }

                                                    </code>


                                                    <strong>

                                                        {
                                                            text(
                                                                item.project_name
                                                            )
                                                        }

                                                    </strong>


                                                    <small>

                                                        {
                                                            text(
                                                                item.request_type
                                                            )
                                                        }

                                                        {' · '}

                                                        {
                                                            text(
                                                                item.status
                                                            )
                                                        }

                                                    </small>

                                                </div>


                                                <span>

                                                    Response:

                                                    {' '}

                                                    {
                                                        n(
                                                            item.response_count
                                                        )
                                                    }

                                                </span>

                                            </Link>

                                        )
                                    )
                            }

                        </div>

                    </div>

                </div>


                <div
                    className="
                        col-12
                        col-xl-6
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

                                    Runs

                                </div>


                                <h3>

                                    اجراهای اخیر

                                </h3>

                            </div>

                        </div>


                        <div
                            className="
                                stagepilot-archive-list
                            "
                        >

                            {
                                archive
                                    .recentRuns
                                    .length
                                ===
                                0

                                ? (

                                    <div
                                        className="
                                            stagepilot-tree-note
                                        "
                                    >

                                        هنوز اجرایی ثبت نشده است.

                                    </div>

                                )

                                :

                                archive
                                    .recentRuns
                                    .map(
                                        item => (

                                            <Link
                                                href={
                                                    `/archive/runs/${item.id}`
                                                }
                                                className="
                                                    stagepilot-archive-row
                                                "
                                                key={
                                                    String(
                                                        item.id
                                                    )
                                                }
                                            >

                                                <div>

                                                    <code>

                                                        {
                                                            text(
                                                                item.run_key
                                                            )
                                                        }

                                                    </code>


                                                    <strong>

                                                        {
                                                            text(
                                                                item.script_filename
                                                            )
                                                        }

                                                    </strong>


                                                    <small>

                                                        {
                                                            text(
                                                                item.project_name
                                                            )
                                                        }

                                                        {' · '}

                                                        {
                                                            text(
                                                                item.status
                                                            )
                                                        }

                                                    </small>

                                                </div>


                                                <span>

                                                    Log:

                                                    {' '}

                                                    {
                                                        n(
                                                            item.log_count
                                                        )
                                                    }

                                                </span>

                                            </Link>

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

                            Git Operations

                        </div>


                        <h3>

                            عملیات Git اخیر

                        </h3>

                    </div>

                </div>


                <div
                    className="
                        stagepilot-archive-list
                    "
                >

                    {
                        archive
                            .recentGit
                            .length
                        ===
                        0

                        ? (

                            <div
                                className="
                                    stagepilot-tree-note
                                "
                            >

                                عملیات Git ثبت نشده است.

                            </div>

                        )

                        :

                        archive
                            .recentGit
                            .map(
                                item => (

                                    <div
                                        className="
                                            stagepilot-archive-row
                                            stagepilot-archive-row-static
                                        "
                                        key={
                                            String(
                                                item.id
                                            )
                                        }
                                    >

                                        <div>

                                            <code>

                                                {
                                                    text(
                                                        item.operation_type
                                                    )
                                                }

                                            </code>


                                            <strong>

                                                {
                                                    text(
                                                        item.repository
                                                    )
                                                }

                                            </strong>


                                            <small>

                                                {
                                                    text(
                                                        item.branch
                                                    )
                                                }

                                            </small>

                                        </div>


                                        <span>

                                            {
                                                text(
                                                    item.status
                                                )
                                            }

                                        </span>

                                    </div>

                                )
                            )
                    }

                </div>

            </section>

        </div>

    );

}

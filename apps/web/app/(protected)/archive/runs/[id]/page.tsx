import Link from 'next/link';


import {
    notFound
} from 'next/navigation';


import {
    loadRunArchive
} from '../../../../../lib/archive';


export const dynamic =
    'force-dynamic';


type Props = {

    params: Promise<{

        id: string;

    }>;

};


function t(
    value: unknown
) {

    return typeof value === 'string'
        ? value
        : '—';

}


export default async function RunArchivePage({

    params

}: Props) {

    const {
        id
    } =
        await params;


    const archive =
        await loadRunArchive(
            id
        );


    if (!archive) {

        notFound();

    }


    const run =
        archive.run;


    return (

        <div>

            <div
                className="
                    stagepilot-back-row
                "
            >

                <Link
                    href="/archive"
                    className="
                        stagepilot-back-link
                    "
                >

                    ← بازگشت به آرشیو

                </Link>

            </div>


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

                        Run Archive

                    </div>


                    <h2>

                        {
                            t(
                                run.run_key
                            )
                        }

                    </h2>


                    <p>

                        {
                            t(
                                run.project_name
                            )
                        }

                        {' · '}

                        {
                            t(
                                run.stage_key
                            )
                        }

                        {' · '}

                        {
                            t(
                                run.work_key
                            )
                        }

                    </p>

                </div>


                <span
                    className="
                        stagepilot-state-badge
                    "
                >

                    {
                        t(
                            run.status
                        )
                    }

                </span>

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
                        col-xl-5
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

                            <h3>

                                اطلاعات اجرا

                            </h3>

                        </div>


                        <div
                            className="
                                stagepilot-detail-list
                            "
                        >

                            <div>

                                <span>
                                    Script
                                </span>

                                <strong>
                                    {
                                        t(
                                            run.script_filename
                                        )
                                    }
                                </strong>

                            </div>


                            <div>

                                <span>
                                    Attempt
                                </span>

                                <strong>
                                    {
                                        String(
                                            run.attempt
                                            ??
                                            '—'
                                        )
                                    }
                                </strong>

                            </div>


                            <div>

                                <span>
                                    Exit Code
                                </span>

                                <strong>
                                    {
                                        String(
                                            run.exit_code
                                            ??
                                            '—'
                                        )
                                    }
                                </strong>

                            </div>


                            <div>

                                <span>
                                    Server
                                </span>

                                <strong>
                                    {
                                        t(
                                            run.target_server
                                        )
                                    }
                                </strong>

                            </div>


                            <div>

                                <span>
                                    Workspace
                                </span>

                                <strong>
                                    {
                                        t(
                                            run.workspace
                                        )
                                    }
                                </strong>

                            </div>

                        </div>

                    </div>

                </div>


                <div
                    className="
                        col-12
                        col-xl-7
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

                            <h3>

                                Script

                            </h3>


                            <code>

                                {
                                    t(
                                        run.script_sha256
                                    )
                                }

                            </code>

                        </div>


                        <pre
                            className="
                                stagepilot-code-block
                            "
                        >

                            {
                                t(
                                    run.script_content
                                )
                            }

                        </pre>

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

                    <h3>

                        لاگ اجرا

                    </h3>


                    <span
                        className="
                            badge
                            text-bg-light
                        "
                    >

                        {
                            archive.logs.length
                        }

                    </span>

                </div>


                <div
                    className="
                        stagepilot-log-viewer
                    "
                >

                    {
                        archive.logs.map(
                            (
                                log:
                                Record<
                                    string,
                                    unknown
                                >
                            ) => (

                                <div
                                    className="
                                        stagepilot-log-line
                                    "
                                    key={
                                        String(
                                            log.id
                                        )
                                    }
                                >

                                    <span>

                                        {
                                            String(
                                                log.sequence_no
                                                ??
                                                ''
                                            )
                                        }

                                    </span>


                                    <strong>

                                        {
                                            t(
                                                log.stream
                                            )
                                        }

                                    </strong>


                                    <pre>

                                        {
                                            t(
                                                log.chunk
                                            )
                                        }

                                    </pre>

                                </div>

                            )
                        )
                    }

                </div>

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

                            <h3>

                                Test Results

                            </h3>

                        </div>


                        {
                            archive.tests.length === 0

                            ? (

                                <div
                                    className="
                                        stagepilot-tree-note
                                    "
                                >

                                    نتیجهٔ تستی ثبت نشده است.

                                </div>

                            )

                            :

                            archive.tests.map(
                                (
                                    test:
                                    Record<
                                        string,
                                        unknown
                                    >
                                ) => (

                                    <div
                                        className="
                                            stagepilot-test-result
                                        "
                                        key={
                                            String(
                                                test.id
                                            )
                                        }
                                    >

                                        <div>

                                            <strong>

                                                {
                                                    t(
                                                        test.title
                                                    )
                                                }

                                            </strong>


                                            <small>

                                                {
                                                    t(
                                                        test.test_key
                                                    )
                                                }

                                            </small>

                                        </div>


                                        <span>

                                            {
                                                t(
                                                    test.status
                                                )
                                            }

                                        </span>

                                    </div>

                                )
                            )
                        }

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

                            <h3>

                                Git

                            </h3>

                        </div>


                        {
                            archive
                                .gitOperations
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
                                .gitOperations
                                .map(
                                    (
                                        git:
                                        Record<
                                            string,
                                            unknown
                                        >
                                    ) => (

                                        <div
                                            className="
                                                stagepilot-test-result
                                            "
                                            key={
                                                String(
                                                    git.id
                                                )
                                            }
                                        >

                                            <div>

                                                <strong>

                                                    {
                                                        t(
                                                            git.operation_type
                                                        )
                                                    }

                                                </strong>


                                                <small>

                                                    {
                                                        t(
                                                            git.branch
                                                        )
                                                    }

                                                    {' · '}

                                                    {
                                                        t(
                                                            git.commit_sha
                                                        )
                                                    }

                                                </small>

                                            </div>


                                            <span>

                                                {
                                                    t(
                                                        git.status
                                                    )
                                                }

                                            </span>

                                        </div>

                                    )
                                )
                        }

                    </div>

                </div>

            </section>

        </div>

    );

}

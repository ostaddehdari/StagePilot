import Link from 'next/link';


import {
    notFound
} from 'next/navigation';


import {
    loadPromptArchive
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


export default async function PromptArchivePage({

    params

}: Props) {

    const {
        id
    } =
        await params;


    const archive =
        await loadPromptArchive(
            id
        );


    if (!archive) {

        notFound();

    }


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

                        Prompt Archive

                    </div>


                    <h2>

                        {
                            t(
                                archive
                                    .prompt
                                    .request_key
                            )
                        }

                    </h2>


                    <p>

                        {
                            t(
                                archive
                                    .prompt
                                    .project_name
                            )
                        }

                        {' · '}

                        {
                            t(
                                archive
                                    .prompt
                                    .request_type
                            )
                        }

                    </p>

                </div>

            </section>


            <section
                className="
                    stagepilot-panel
                    mt-3
                "
            >

                <div
                    className="
                        stagepilot-panel-header
                    "
                >

                    <h3>
                        متن پرامپت
                    </h3>

                    <span
                        className="
                            stagepilot-state-badge
                        "
                    >

                        {
                            t(
                                archive
                                    .prompt
                                    .status
                            )
                        }

                    </span>

                </div>


                <pre
                    className="
                        stagepilot-code-block
                    "
                >

                    {
                        t(
                            archive
                                .prompt
                                .prompt_text
                        )
                    }

                </pre>

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

                        پاسخ‌ها

                    </h3>


                    <span
                        className="
                            badge
                            text-bg-light
                        "
                    >

                        {
                            archive
                                .responses
                                .length
                        }

                    </span>

                </div>


                {
                    archive
                        .responses
                        .map(
                            (
                                response:
                                Record<
                                    string,
                                    unknown
                                >
                            ) => (

                                <div
                                    className="
                                        stagepilot-archive-section
                                    "
                                    key={
                                        String(
                                            response.id
                                        )
                                    }
                                >

                                    <div
                                        className="
                                            stagepilot-archive-section-title
                                        "
                                    >

                                        <code>

                                            {
                                                t(
                                                    response.response_type
                                                )
                                            }

                                        </code>


                                        <span>

                                            {
                                                response.is_complete
                                                ? 'Complete'
                                                : 'Incomplete'
                                            }

                                        </span>

                                    </div>


                                    <pre
                                        className="
                                            stagepilot-code-block
                                        "
                                    >

                                        {
                                            t(
                                                response.raw_text
                                            )
                                        }

                                    </pre>

                                </div>

                            )
                        )
                }

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

                        اسکریپت‌ها

                    </h3>

                </div>


                {
                    archive
                        .scripts
                        .map(
                            (
                                script:
                                Record<
                                    string,
                                    unknown
                                >
                            ) => (

                                <div
                                    className="
                                        stagepilot-archive-section
                                    "
                                    key={
                                        String(
                                            script.id
                                        )
                                    }
                                >

                                    <div
                                        className="
                                            stagepilot-archive-section-title
                                        "
                                    >

                                        <strong>

                                            {
                                                t(
                                                    script.filename
                                                )
                                            }

                                        </strong>


                                        <code>

                                            {
                                                t(
                                                    script.sha256
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
                                                script.content
                                            )
                                        }

                                    </pre>

                                </div>

                            )
                        )
                }

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

                        اجراهای این پرامپت

                    </h3>

                </div>


                <div
                    className="
                        stagepilot-archive-list
                    "
                >

                    {
                        archive
                            .runs
                            .map(
                                (
                                    run:
                                    Record<
                                        string,
                                        unknown
                                    >
                                ) => (

                                    <Link
                                        href={
                                            `/archive/runs/${run.id}`
                                        }
                                        className="
                                            stagepilot-archive-row
                                        "
                                        key={
                                            String(
                                                run.id
                                            )
                                        }
                                    >

                                        <div>

                                            <code>

                                                {
                                                    t(
                                                        run.run_key
                                                    )
                                                }

                                            </code>


                                            <strong>

                                                {
                                                    t(
                                                        run.script_filename
                                                    )
                                                }

                                            </strong>

                                        </div>


                                        <span>

                                            {
                                                t(
                                                    run.status
                                                )
                                            }

                                        </span>

                                    </Link>

                                )
                            )
                    }

                </div>

            </section>

        </div>

    );

}

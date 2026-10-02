import Link from 'next/link';


import {
    createProjectAction
} from './actions';


import {
    loadProjects
} from '../../../lib/projects';


import type {
    ProjectListItem
} from '../../../lib/projects';


export const dynamic =
    'force-dynamic';


type ProjectsPageProps = {

    searchParams: Promise<{

        error?: string;

    }>;

};


function numberFormat(
    value: number
) {

    return new Intl.NumberFormat(
        'fa-IR'
    ).format(
        value
    );

}


function statusLabel(
    status: string
) {

    const labels:
        Record<string, string> = {

        draft:
            'پیش‌نویس',

        active:
            'فعال',

        paused:
            'متوقف',

        completed:
            'تکمیل‌شده'

    };


    return labels[status]
        ??
        status;

}


export default async function ProjectsPage({

    searchParams

}: ProjectsPageProps) {

    const params =
        await searchParams;


    let projects: ProjectListItem[] = [];


    let apiError = false;


    try {

        projects =
            await loadProjects();

    } catch {

        apiError =
            true;

    }


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

                        Projects

                    </div>


                    <h2>

                        پروژه‌ها

                    </h2>


                    <p>

                        پروژهٔ جدید را تعریف کن؛
                        درخواست اولیه در Revision
                        اول ذخیره می‌شود و در مراحل
                        بعد به Stage و Work تبدیل
                        خواهد شد.

                    </p>

                </div>


                <div
                    className="
                        stagepilot-section-count
                    "
                >

                    {
                        numberFormat(
                            projects.length
                        )
                    }

                    <span>
                        پروژه
                    </span>

                </div>

            </section>


            {
                params.error
                ===
                'create'
                &&
                (

                    <div
                        className="
                            alert
                            alert-danger
                            mt-4
                        "
                    >

                        ایجاد پروژه انجام نشد.
                        نام، شناسهٔ پروژه و متن
                        درخواست را بررسی کن.

                    </div>

                )
            }


            {
                apiError
                &&
                (

                    <div
                        className="
                            alert
                            alert-warning
                            mt-4
                        "
                    >

                        API پروژه‌ها در دسترس نیست.

                    </div>

                )
            }


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
                        col-xxl-5
                    "
                >

                    <div
                        className="
                            stagepilot-panel
                            stagepilot-project-create
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

                                    New Project

                                </div>


                                <h3>

                                    ایجاد پروژهٔ جدید

                                </h3>

                            </div>

                        </div>


                        <form
                            action={
                                createProjectAction
                            }
                            className="
                                stagepilot-form
                            "
                        >

                            <div>

                                <label
                                    className="
                                        form-label
                                    "
                                    htmlFor="name"
                                >

                                    نام پروژه

                                </label>


                                <input
                                    id="name"
                                    name="name"
                                    className="
                                        form-control
                                    "
                                    required
                                    minLength={2}
                                    maxLength={160}
                                    placeholder="مثلاً سیستم مدیریت محتوای هوشمند"
                                />

                            </div>


                            <div>

                                <label
                                    className="
                                        form-label
                                    "
                                    htmlFor="slug"
                                >

                                    شناسهٔ انگلیسی

                                </label>


                                <input
                                    id="slug"
                                    name="slug"
                                    className="
                                        form-control
                                        font-monospace
                                    "
                                    dir="ltr"
                                    minLength={3}
                                    maxLength={63}
                                    pattern="[a-zA-Z0-9][a-zA-Z0-9-]{2,62}"
                                    placeholder="my-project"
                                />


                                <div
                                    className="
                                        form-text
                                    "
                                >

                                    اختیاری؛ در صورت
                                    خالی‌بودن خودکار ساخته
                                    می‌شود.

                                </div>

                            </div>


                            <div>

                                <label
                                    className="
                                        form-label
                                    "
                                    htmlFor="description"
                                >

                                    توضیح کوتاه

                                </label>


                                <textarea
                                    id="description"
                                    name="description"
                                    className="
                                        form-control
                                    "
                                    rows={3}
                                    maxLength={5000}
                                    placeholder="هدف کلی پروژه را کوتاه توضیح بده."
                                />

                            </div>


                            <div>

                                <label
                                    className="
                                        form-label
                                    "
                                    htmlFor="requestText"
                                >

                                    درخواست اصلی پروژه

                                </label>


                                <textarea
                                    id="requestText"
                                    name="requestText"
                                    className="
                                        form-control
                                        stagepilot-request-input
                                    "
                                    rows={9}
                                    required
                                    minLength={10}
                                    maxLength={30000}
                                    placeholder="تمام خواسته‌ها، محدودیت‌ها و نتیجه‌ای که از پروژه انتظار داری را اینجا بنویس..."
                                />


                                <div
                                    className="
                                        form-text
                                    "
                                >

                                    این متن بدون تغییر
                                    به‌عنوان Revision 1
                                    نگهداری خواهد شد.

                                </div>

                            </div>


                            <button
                                type="submit"
                                className="
                                    btn
                                    btn-dark
                                    stagepilot-primary-button
                                "
                            >

                                ایجاد پروژه و ذخیرهٔ درخواست

                            </button>

                        </form>

                    </div>

                </div>


                <div
                    className="
                        col-12
                        col-xxl-7
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

                                    Workspace

                                </div>


                                <h3>

                                    پروژه‌های من

                                </h3>

                            </div>

                        </div>


                        {
                            projects.length
                            ===
                            0

                            ? (

                                <div
                                    className="
                                        stagepilot-project-empty
                                    "
                                >

                                    <div
                                        className="
                                            stagepilot-project-empty-mark
                                        "
                                    >

                                        +

                                    </div>


                                    <h4>

                                        هنوز پروژه‌ای ایجاد نشده

                                    </h4>


                                    <p>

                                        اولین پروژه را از فرم
                                        همین صفحه بساز.

                                    </p>

                                </div>

                            )

                            : (

                                <div
                                    className="
                                        stagepilot-project-list
                                    "
                                >

                                    {
                                        projects.map(
                                            project => (

                                                <Link
                                                    href={
                                                        `/projects/${project.id}`
                                                    }
                                                    key={
                                                        project.id
                                                    }
                                                    className="
                                                        stagepilot-project-card
                                                    "
                                                >

                                                    <div
                                                        className="
                                                            stagepilot-project-card-top
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


                                                            <h4>

                                                                {
                                                                    project.name
                                                                }

                                                            </h4>

                                                        </div>


                                                        <span
                                                            className="
                                                                stagepilot-project-status
                                                            "
                                                        >

                                                            {
                                                                statusLabel(
                                                                    project.status
                                                                )
                                                            }

                                                        </span>

                                                    </div>


                                                    <p>

                                                        {
                                                            project.description
                                                            ||
                                                            'بدون توضیح کوتاه'
                                                        }

                                                    </p>


                                                    <div
                                                        className="
                                                            stagepilot-progress-row
                                                        "
                                                    >

                                                        <div
                                                            className="
                                                                stagepilot-progress-track
                                                            "
                                                        >

                                                            <div
                                                                className="
                                                                    stagepilot-progress-value
                                                                "
                                                                style={{
                                                                    width:
                                                                        `${Math.min(
                                                                            100,
                                                                            Math.max(
                                                                                0,
                                                                                project.progress_percent
                                                                            )
                                                                        )}%`
                                                                }}
                                                            />

                                                        </div>


                                                        <strong>

                                                            {
                                                                numberFormat(
                                                                    project.progress_percent
                                                                )
                                                            }

                                                            ٪

                                                        </strong>

                                                    </div>


                                                    <div
                                                        className="
                                                            stagepilot-project-meta
                                                        "
                                                    >

                                                        <span>

                                                            Stage:

                                                            {' '}

                                                            {
                                                                numberFormat(
                                                                    project.stage_count
                                                                )
                                                            }

                                                        </span>


                                                        <span>

                                                            Work:

                                                            {' '}

                                                            {
                                                                numberFormat(
                                                                    project.work_count
                                                                )
                                                            }

                                                        </span>


                                                        <span>

                                                            Revision:

                                                            {' '}

                                                            {
                                                                numberFormat(
                                                                    project.current_plan_revision
                                                                )
                                                            }

                                                        </span>

                                                    </div>

                                                </Link>

                                            )
                                        )
                                    }

                                </div>

                            )
                        }

                    </div>

                </div>

            </section>

        </div>

    );

}

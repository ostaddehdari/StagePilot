import Link from 'next/link';


import {
    notFound
} from 'next/navigation';


import {
    loadChatAccounts
} from '../../../../../lib/chat-accounts';


import {
    loadProject
} from '../../../../../lib/projects';


import {
    loadProjectChatRegistry
} from '../../../../../lib/project-chat';


import {
    registerExistingConversationAction,
    requestNewConversationAction,
    selectChatAccountAction
} from './actions';


export const dynamic =
    'force-dynamic';


type PageProps = {

    params: Promise<{

        id: string;

    }>;

    searchParams: Promise<{

        error?: string;

        success?: string;

    }>;

};


function statusLabel(
    status?: string | null
) {

    const labels:
        Record<string, string> = {

        active:
            'فعال',

        pending_creation:
            'در انتظار ساخت چت',

        closed:
            'بسته‌شده',

        needs_login:
            'نیازمند ورود',

        ready:
            'آماده',

        busy:
            'مشغول',

        expired:
            'ورود منقضی',

        error:
            'خطا'

    };


    if (!status) {

        return 'نامشخص';

    }


    return labels[status]
        ??
        status;

}


function dateLabel(
    value: string
) {

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

}


export default async function ProjectChatPage({

    params,
    searchParams

}: PageProps) {

    const {
        id
    } =
        await params;


    const query =
        await searchParams;


    const [
        projectDetail,
        accounts,
        registry
    ] =
        await Promise.all([

            loadProject(
                id
            ),

            loadChatAccounts(),

            loadProjectChatRegistry(
                id
            )

        ]);


    if (!projectDetail) {

        notFound();

    }


    const selectedId =
        registry.project
            .selected_chat_account_id;


    return (

        <div>

            <div
                className="
                    stagepilot-back-row
                    stagepilot-project-toolbar
                "
            >

                <Link
                    href={
                        `/projects/${id}`
                    }
                    className="
                        stagepilot-back-link
                    "
                >

                    ← بازگشت به پروژه

                </Link>


                <span>

                    Chat Registry

                </span>

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

                        Project Chat

                    </div>


                    <h2>

                        چت پروژه

                    </h2>


                    <p>

                        حساب ChatGPT مورد استفادهٔ
                        پروژه و تاریخچهٔ چت‌های آن
                        در این بخش نگهداری می‌شوند.

                    </p>

                </div>


                <div
                    className="
                        stagepilot-project-chat-project
                    "
                >

                    <span>

                        پروژه

                    </span>


                    <strong>

                        {
                            projectDetail
                                .project
                                .name
                        }

                    </strong>

                </div>

            </section>


            {
                query.error
                &&
                (

                    <div
                        className="
                            alert
                            alert-danger
                            mt-3
                        "
                    >

                        عملیات انجام نشد.
                        تنظیمات حساب یا اطلاعات
                        Conversation را بررسی کن.

                    </div>

                )
            }


            {
                query.success
                &&
                (

                    <div
                        className="
                            alert
                            alert-success
                            mt-3
                        "
                    >

                        تغییرات Chat Registry
                        با موفقیت ذخیره شد.

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

                            <div>

                                <div
                                    className="
                                        stagepilot-panel-eyebrow
                                    "
                                >

                                    ChatGPT Account

                                </div>


                                <h3>

                                    حساب پروژه

                                </h3>

                            </div>

                        </div>


                        {
                            accounts.length
                            ===
                            0

                            ? (

                                <div
                                    className="
                                        alert
                                        alert-warning
                                        mb-0
                                    "
                                >

                                    ابتدا در بخش
                                    حساب‌های ChatGPT
                                    یک Account Profile بساز.

                                    <div
                                        className="
                                            mt-3
                                        "
                                    >

                                        <Link
                                            href="/chat-accounts"
                                            className="
                                                btn
                                                btn-sm
                                                btn-dark
                                            "
                                        >

                                            حساب‌های ChatGPT

                                        </Link>

                                    </div>

                                </div>

                            )

                            : (

                                <form
                                    action={
                                        selectChatAccountAction
                                            .bind(
                                                null,
                                                id
                                            )
                                    }
                                    className="
                                        stagepilot-form
                                    "
                                >

                                    <div>

                                        <label
                                            htmlFor="chatAccountId"
                                            className="
                                                form-label
                                            "
                                        >

                                            حساب منتخب

                                        </label>


                                        <select
                                            id="chatAccountId"
                                            name="chatAccountId"
                                            className="
                                                form-select
                                            "
                                            defaultValue={
                                                selectedId
                                                ??
                                                ''
                                            }
                                            required
                                        >

                                            <option
                                                value=""
                                                disabled
                                            >

                                                انتخاب حساب

                                            </option>


                                            {
                                                accounts.map(
                                                    account => (

                                                        <option
                                                            value={
                                                                account.id
                                                            }
                                                            key={
                                                                account.id
                                                            }
                                                        >

                                                            {
                                                                account.label
                                                            }

                                                            {' — '}

                                                            {
                                                                statusLabel(
                                                                    account.status
                                                                )
                                                            }

                                                        </option>

                                                    )
                                                )
                                            }

                                        </select>

                                    </div>


                                    <button
                                        type="submit"
                                        className="
                                            btn
                                            btn-dark
                                            stagepilot-primary-button
                                        "
                                    >

                                        ذخیرهٔ حساب پروژه

                                    </button>

                                </form>

                            )
                        }


                        {
                            selectedId
                            &&
                            (

                                <div
                                    className="
                                        stagepilot-selected-account
                                    "
                                >

                                    <div
                                        className="
                                            stagepilot-panel-eyebrow
                                        "
                                    >

                                        Selected

                                    </div>


                                    <strong>

                                        {
                                            registry
                                                .project
                                                .selected_chat_account_label
                                        }

                                    </strong>


                                    <span>

                                        {
                                            statusLabel(
                                                registry
                                                    .project
                                                    .selected_chat_account_status
                                            )
                                        }

                                    </span>


                                    <code>

                                        {
                                            registry
                                                .project
                                                .selected_chat_profile_key
                                        }

                                    </code>

                                </div>

                            )
                        }

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

                                    Active Conversation

                                </div>


                                <h3>

                                    چت فعال پروژه

                                </h3>

                            </div>

                        </div>


                        {
                            !selectedId

                            ? (

                                <div
                                    className="
                                        stagepilot-tree-note
                                    "
                                >

                                    ابتدا حساب ChatGPT پروژه را انتخاب کن.

                                </div>

                            )

                            :
                            registry.activeConversation

                            ? (

                                <div
                                    className="
                                        stagepilot-active-conversation
                                    "
                                >

                                    <div>

                                        <span>

                                            Sequence

                                        </span>


                                        <strong>

                                            #

                                            {
                                                registry
                                                    .activeConversation
                                                    .sequence_no
                                            }

                                        </strong>

                                    </div>


                                    <div>

                                        <span>

                                            Status

                                        </span>


                                        <strong>

                                            {
                                                statusLabel(
                                                    registry
                                                        .activeConversation
                                                        .status
                                                )
                                            }

                                        </strong>

                                    </div>


                                    <div>

                                        <span>

                                            Chat ID

                                        </span>


                                        <code>

                                            {
                                                registry
                                                    .activeConversation
                                                    .external_chat_id
                                                ??
                                                'pending'
                                            }

                                        </code>

                                    </div>


                                    {
                                        registry
                                            .activeConversation
                                            .external_url
                                        &&
                                        (

                                            <a
                                                href={
                                                    registry
                                                        .activeConversation
                                                        .external_url
                                                }
                                                target="_blank"
                                                rel="noreferrer"
                                            >

                                                بازکردن ChatGPT

                                            </a>

                                        )
                                    }

                                </div>

                            )

                            : (

                                <div
                                    className="
                                        stagepilot-tree-note
                                    "
                                >

                                    هنوز چت فعالی برای این پروژه ثبت نشده است.

                                </div>

                            )
                        }

                    </div>

                </div>

            </section>


            {
                selectedId
                &&
                (

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

                                    <div>

                                        <div
                                            className="
                                                stagepilot-panel-eyebrow
                                            "
                                        >

                                            Existing Chat

                                        </div>


                                        <h3>

                                            اتصال چت موجود

                                        </h3>

                                    </div>

                                </div>


                                <form
                                    action={
                                        registerExistingConversationAction
                                            .bind(
                                                null,
                                                id
                                            )
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
                                            htmlFor="externalUrl"
                                        >

                                            URL چت ChatGPT

                                        </label>


                                        <input
                                            id="externalUrl"
                                            name="externalUrl"
                                            type="url"
                                            className="
                                                form-control
                                            "
                                            dir="ltr"
                                            required
                                            placeholder="https://chatgpt.com/c/..."
                                        />

                                    </div>


                                    <div>

                                        <label
                                            className="
                                                form-label
                                            "
                                            htmlFor="externalChatId"
                                        >

                                            Chat ID

                                        </label>


                                        <input
                                            id="externalChatId"
                                            name="externalChatId"
                                            className="
                                                form-control
                                                font-monospace
                                            "
                                            dir="ltr"
                                            placeholder="اختیاری؛ در صورت امکان از URL استخراج می‌شود"
                                        />

                                    </div>


                                    <button
                                        type="submit"
                                        className="
                                            btn
                                            btn-dark
                                            stagepilot-primary-button
                                        "
                                    >

                                        ثبت به‌عنوان چت فعال

                                    </button>

                                </form>

                            </div>

                        </div>


                        <div
                            className="
                                col-12
                                col-xl-5
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

                                            New Chat

                                        </div>


                                        <h3>

                                            درخواست چت جدید

                                        </h3>

                                    </div>

                                </div>


                                <p
                                    className="
                                        stagepilot-chat-help
                                    "
                                >

                                    StagePilot یک Conversation
                                    با وضعیت
                                    <code>pending_creation</code>
                                    ایجاد می‌کند. در مرحلهٔ
                                    Browser Automation، بعد از
                                    ساخته‌شدن اولین پیام، URL
                                    واقعی ChatGPT روی همین رکورد
                                    ذخیره خواهد شد.

                                </p>


                                <form
                                    action={
                                        requestNewConversationAction
                                            .bind(
                                                null,
                                                id
                                            )
                                    }
                                >

                                    <button
                                        type="submit"
                                        className="
                                            btn
                                            btn-outline-dark
                                            stagepilot-primary-button
                                            w-100
                                        "
                                    >

                                        ایجاد درخواست چت جدید

                                    </button>

                                </form>

                            </div>

                        </div>

                    </section>

                )
            }


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

                            Conversation History

                        </div>


                        <h3>

                            تاریخچهٔ چت‌های پروژه

                        </h3>

                    </div>


                    <span
                        className="
                            badge
                            text-bg-light
                        "
                    >

                        {
                            registry
                                .conversations
                                .length
                        }

                    </span>

                </div>


                {
                    registry
                        .conversations
                        .length
                    ===
                    0

                    ? (

                        <div
                            className="
                                stagepilot-tree-note
                            "
                        >

                            هنوز Conversation ثبت نشده است.

                        </div>

                    )

                    : (

                        <div
                            className="
                                stagepilot-conversation-history
                            "
                        >

                            {
                                registry
                                    .conversations
                                    .map(
                                        conversation => (

                                            <div
                                                className="
                                                    stagepilot-conversation-row
                                                "
                                                key={
                                                    conversation.id
                                                }
                                            >

                                                <div
                                                    className="
                                                        stagepilot-conversation-seq
                                                    "
                                                >

                                                    #

                                                    {
                                                        conversation.sequence_no
                                                    }

                                                </div>


                                                <div
                                                    className="
                                                        flex-grow-1
                                                    "
                                                >

                                                    <strong>

                                                        {
                                                            conversation
                                                                .chat_account_label
                                                            ??
                                                            'ChatGPT Account'
                                                        }

                                                    </strong>


                                                    <div>

                                                        {
                                                            conversation
                                                                .started_reason
                                                            ??
                                                            'بدون دلیل ثبت‌شده'
                                                        }

                                                    </div>


                                                    <small>

                                                        {
                                                            dateLabel(
                                                                conversation
                                                                    .created_at
                                                            )
                                                        }

                                                    </small>

                                                </div>


                                                <span
                                                    className={`
                                                        stagepilot-state-badge
                                                        state-${conversation.status}
                                                    `}
                                                >

                                                    {
                                                        statusLabel(
                                                            conversation.status
                                                        )
                                                    }

                                                </span>


                                                <code>

                                                    {
                                                        conversation
                                                            .external_chat_id
                                                        ??
                                                        'pending'
                                                    }

                                                </code>

                                            </div>

                                        )
                                    )
                            }

                        </div>

                    )
                }

            </section>

        </div>

    );

}

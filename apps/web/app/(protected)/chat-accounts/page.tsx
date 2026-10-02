import Link from 'next/link';


import {
    createChatAccountAction
} from './actions';


import {
    loadChatAccounts
} from '../../../lib/chat-accounts';


import type {
    ChatAccountListItem
} from '../../../lib/chat-accounts';


export const dynamic =
    'force-dynamic';


type PageProps = {

    searchParams: Promise<{

        error?: string;

    }>;

};


function statusLabel(
    status?: string | null
) {

    const labels:
        Record<string, string> = {

        needs_login:
            'نیازمند ورود',

        ready:
            'آماده',

        busy:
            'مشغول',

        expired:
            'ورود منقضی',

        error:
            'خطا',

        stopped:
            'متوقف',

        unknown:
            'نامشخص'

    };


    if (!status) {

        return 'نامشخص';

    }


    return labels[status]
        ??
        status;

}


function numberFormat(
    value: number
) {

    return new Intl.NumberFormat(
        'fa-IR'
    ).format(
        value
    );

}


export default async function ChatAccountsPage({

    searchParams

}: PageProps) {

    const params =
        await searchParams;


    let accounts: ChatAccountListItem[] = [];


    let apiError = false;


    try {

        accounts =
            await loadChatAccounts();

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

                        ChatGPT Accounts

                    </div>


                    <h2>

                        حساب‌های ChatGPT

                    </h2>


                    <p>

                        برای هر حساب یک Profile
                        مستقل مرورگر نگهداری می‌شود.
                        noVNC فقط هنگام ورود یا
                        ورود مجدد فعال خواهد شد و
                        اجرای عادی حساب Headless
                        خواهد بود.

                    </p>

                </div>


                <div
                    className="
                        stagepilot-section-count
                    "
                >

                    {
                        numberFormat(
                            accounts.length
                        )
                    }

                    <span>
                        حساب
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

                        ایجاد حساب انجام نشد.
                        نام حساب را بررسی کن.

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

                        API حساب‌های ChatGPT
                        در دسترس نیست.

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
                        col-xxl-4
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

                                    New Account

                                </div>


                                <h3>

                                    افزودن حساب

                                </h3>

                            </div>

                        </div>


                        <form
                            action={
                                createChatAccountAction
                            }
                            className="
                                stagepilot-form
                            "
                        >

                            <div>

                                <label
                                    htmlFor="label"
                                    className="
                                        form-label
                                    "
                                >

                                    نام دلخواه حساب

                                </label>


                                <input
                                    id="label"
                                    name="label"
                                    className="
                                        form-control
                                    "
                                    required
                                    minLength={2}
                                    maxLength={120}
                                    placeholder="مثلاً حساب اصلی Pro"
                                />

                            </div>


                            <div>

                                <label
                                    htmlFor="note"
                                    className="
                                        form-label
                                    "
                                >

                                    یادداشت

                                </label>


                                <textarea
                                    id="note"
                                    name="note"
                                    className="
                                        form-control
                                    "
                                    rows={4}
                                    maxLength={2000}
                                    placeholder="مثلاً مخصوص پروژه‌های اصلی"
                                />

                            </div>


                            <div
                                className="
                                    stagepilot-account-policy
                                "
                            >

                                <strong>

                                    سیاست مرورگر

                                </strong>


                                <span>

                                    Login: noVNC

                                </span>


                                <span>

                                    Normal: Headless

                                </span>


                                <small>

                                    رمز عبور یا OTP در
                                    StagePilot ذخیره
                                    نمی‌شود.

                                </small>

                            </div>


                            <button
                                type="submit"
                                className="
                                    btn
                                    btn-dark
                                    stagepilot-primary-button
                                "
                            >

                                ساخت Profile حساب

                            </button>

                        </form>

                    </div>

                </div>


                <div
                    className="
                        col-12
                        col-xxl-8
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

                                    Browser Profiles

                                </div>


                                <h3>

                                    حساب‌های ثبت‌شده

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
                                        stagepilot-project-empty
                                    "
                                >

                                    <div
                                        className="
                                            stagepilot-project-empty-mark
                                        "
                                    >

                                        C

                                    </div>


                                    <h4>

                                        هنوز حسابی ثبت نشده

                                    </h4>


                                    <p>

                                        یک Profile مستقل
                                        برای اولین حساب بساز.

                                    </p>

                                </div>

                            )

                            : (

                                <div
                                    className="
                                        stagepilot-account-list
                                    "
                                >

                                    {
                                        accounts.map(
                                            account => (

                                                <Link
                                                    href={
                                                        `/chat-accounts/${account.id}`
                                                    }
                                                    key={
                                                        account.id
                                                    }
                                                    className="
                                                        stagepilot-account-card
                                                    "
                                                >

                                                    <div
                                                        className="
                                                            stagepilot-account-card-main
                                                        "
                                                    >

                                                        <div
                                                            className="
                                                                stagepilot-account-avatar
                                                            "
                                                        >

                                                            GPT

                                                        </div>


                                                        <div
                                                            className="
                                                                flex-grow-1
                                                            "
                                                        >

                                                            <div
                                                                className="
                                                                    stagepilot-account-key
                                                                "
                                                            >

                                                                {
                                                                    account.profile_key
                                                                }

                                                            </div>


                                                            <h4>

                                                                {
                                                                    account.label
                                                                }

                                                            </h4>


                                                            <div
                                                                className="
                                                                    stagepilot-account-meta
                                                                "
                                                            >

                                                                <span>

                                                                    Conversation:

                                                                    {' '}

                                                                    {
                                                                        numberFormat(
                                                                            account.conversation_count
                                                                        )
                                                                    }

                                                                </span>


                                                                <span>

                                                                    Project:

                                                                    {' '}

                                                                    {
                                                                        numberFormat(
                                                                            account.selected_project_count
                                                                        )
                                                                    }

                                                                </span>


                                                                <span>

                                                                    Mode:

                                                                    {' '}

                                                                    {
                                                                        account.browser_mode
                                                                        ??
                                                                        'headless'
                                                                    }

                                                                </span>

                                                            </div>

                                                        </div>


                                                        <span
                                                            className={`
                                                                stagepilot-state-badge
                                                                state-${account.status}
                                                            `}
                                                        >

                                                            {
                                                                statusLabel(
                                                                    account.status
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

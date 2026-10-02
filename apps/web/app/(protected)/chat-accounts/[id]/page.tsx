import Link from 'next/link';


import {
    notFound
} from 'next/navigation';


import {
    loadChatAccount,
    loadChatAccountBrowserLogin,
    loadChatAccountBrowserRuntime
} from '../../../../lib/chat-accounts';


import {
    completeLoginAction,
    startLoginAction,
    stopHeadlessAction,
    stopLoginAction
} from './actions';


export const dynamic =
    'force-dynamic';


type PageProps = {

    params: Promise<{
        id: string;
    }>;

    searchParams: Promise<{
        error?: string;
        login?: string;
        transition?: string;
        headless?: string;
    }>;

};


function stateLabel(
    value?: string | null
) {

    const labels:
        Record<string, string> = {

        authenticated:
            'ورود تأیید شده',

        needs_login:
            'نیازمند ورود',

        challenge:
            'بررسی امنیتی',

        unknown:
            'نامشخص',

        validation_pending:
            'در انتظار اعتبارسنجی',

        ready:
            'آماده',

        stopped:
            'متوقف',

        stale:
            'Session قدیمی',

        visible:
            'Visible',

        headless:
            'Headless',

        none:
            'خاموش'

    };


    if (!value) {

        return 'نامشخص';

    }


    return labels[value]
        ??
        value;

}


export default async function ChatAccountPage({

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
        detail,
        browserLogin,
        browserRuntime
    ] =
        await Promise.all([

            loadChatAccount(
                id
            ),

            loadChatAccountBrowserLogin(
                id
            ),

            loadChatAccountBrowserRuntime(
                id
            )

        ]);


    if (!detail) {

        notFound();

    }


    const account =
        detail.account;


    const validation =
        browserRuntime.validation
        ??
        {};


    const visibleReady =
        browserRuntime.mode
        ===
        'visible'
        &&
        browserRuntime.status
        ===
        'ready';


    const headlessReady =
        browserRuntime.mode
        ===
        'headless'
        &&
        browserRuntime.status
        ===
        'ready';


    return (

        <div>

            <div
                className="
                    stagepilot-back-row
                "
            >

                <Link
                    href="/chat-accounts"
                    className="
                        stagepilot-back-link
                    "
                >

                    ← بازگشت به حساب‌ها

                </Link>

            </div>


            {
                query.transition === 'success'
                &&
                (

                    <div
                        className="
                            alert
                            alert-success
                        "
                    >

                        ورود ChatGPT تأیید شد و
                        همان Browser Profile با
                        موفقیت به Headless منتقل شد.

                    </div>

                )
            }


            {
                query.transition
                &&
                query.transition !== 'success'
                &&
                (

                    <div
                        className="
                            alert
                            alert-warning
                        "
                    >

                        احراز ورود قطعی نشد؛
                        Login Visible دوباره فعال شد.

                    </div>

                )
            }


            {
                query.error
                &&
                (

                    <div
                        className="
                            alert
                            alert-danger
                        "
                    >

                        عملیات Browser Runtime انجام نشد.

                    </div>

                )
            }


            <section
                className="
                    stagepilot-project-header
                "
            >

                <div>

                    <div
                        className="
                            stagepilot-account-key
                        "
                    >

                        {
                            account.profile_key
                        }

                    </div>


                    <h2>

                        {
                            account.label
                        }

                    </h2>


                    <p>

                        ورود دستی فقط در حالت Visible
                        انجام می‌شود؛ اجرای عادی پس از
                        تأیید Session در Headless خواهد بود.

                    </p>

                </div>


                <div
                    className="
                        stagepilot-account-status-box
                    "
                >

                    <span>
                        Authentication
                    </span>


                    <strong>

                        {
                            stateLabel(
                                browserRuntime.authState
                            )
                        }

                    </strong>

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

                            Browser Lifecycle

                        </div>


                        <h3>

                            Visible → Validate → Headless

                        </h3>

                    </div>


                    <span
                        className="
                            stagepilot-state-badge
                        "
                    >

                        {
                            stateLabel(
                                browserRuntime.mode
                            )
                        }

                    </span>

                </div>


                <div
                    className="
                        stagepilot-browser-runtime-grid
                    "
                >

                    <div>

                        <span>
                            Mode
                        </span>

                        <strong>

                            {
                                browserRuntime.mode
                            }

                        </strong>

                    </div>


                    <div>

                        <span>
                            Runtime
                        </span>

                        <strong>

                            {
                                browserRuntime.status
                            }

                        </strong>

                    </div>


                    <div>

                        <span>
                            Auth
                        </span>

                        <strong>

                            {
                                browserRuntime.authState
                            }

                        </strong>

                    </div>


                    <div>

                        <span>
                            Confidence
                        </span>

                        <strong>

                            {
                                typeof validation.confidence
                                ===
                                'number'
                                ? `${Math.round(
                                    validation.confidence
                                    *
                                    100
                                )}%`
                                : '—'
                            }

                        </strong>

                    </div>

                </div>


                <div
                    className="
                        stagepilot-login-actions
                    "
                >

                    {
                        browserRuntime.mode === 'none'
                        &&
                        (

                            <form
                                action={
                                    startLoginAction.bind(
                                        null,
                                        id
                                    )
                                }
                            >

                                <button
                                    type="submit"
                                    className="
                                        btn
                                        btn-dark
                                    "
                                >

                                    شروع ورود

                                </button>

                            </form>

                        )
                    }


                    {
                        visibleReady
                        &&
                        browserLogin.viewerUrl
                        &&
                        (

                            <a
                                href={
                                    browserLogin.viewerUrl
                                }
                                target="_blank"
                                rel="noreferrer"
                                className="
                                    btn
                                    btn-primary
                                "
                            >

                                باز کردن noVNC

                            </a>

                        )
                    }


                    {
                        visibleReady
                        &&
                        (

                            <form
                                action={
                                    completeLoginAction.bind(
                                        null,
                                        id
                                    )
                                }
                            >

                                <button
                                    type="submit"
                                    className="
                                        btn
                                        btn-success
                                    "
                                >

                                    اتمام ورود و انتقال به Headless

                                </button>

                            </form>

                        )
                    }


                    {
                        visibleReady
                        &&
                        (

                            <form
                                action={
                                    stopLoginAction.bind(
                                        null,
                                        id
                                    )
                                }
                            >

                                <button
                                    type="submit"
                                    className="
                                        btn
                                        btn-outline-danger
                                    "
                                >

                                    لغو Login Visible

                                </button>

                            </form>

                        )
                    }


                    {
                        headlessReady
                        &&
                        (

                            <form
                                action={
                                    stopHeadlessAction.bind(
                                        null,
                                        id
                                    )
                                }
                            >

                                <button
                                    type="submit"
                                    className="
                                        btn
                                        btn-outline-danger
                                    "
                                >

                                    توقف Headless

                                </button>

                            </form>

                        )
                    }


                    <Link
                        href={
                            `/chat-accounts/${id}`
                        }
                        className="
                            btn
                            btn-outline-secondary
                        "
                    >

                        بررسی مجدد وضعیت

                    </Link>

                </div>


                <div
                    className="
                        stagepilot-login-security-note
                    "
                >

                    <strong>

                        Conservative Validation

                    </strong>


                    <p>

                        وجود کادر Prompt به‌تنهایی
                        Login محسوب نمی‌شود.
                        فقط شواهد مثبت معتبر می‌توانند
                        وضعیت authenticated ایجاد کنند.
                        اگر نتیجه نامطمئن باشد،
                        Headless بسته و Visible Login
                        دوباره فعال می‌شود.

                    </p>

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
                                Runtime State
                            </h3>

                        </div>


                        <div
                            className="
                                stagepilot-detail-list
                            "
                        >

                            <div>

                                <span>
                                    Account
                                </span>

                                <strong>
                                    {
                                        account.status
                                    }
                                </strong>

                            </div>


                            <div>

                                <span>
                                    Runtime
                                </span>

                                <strong>
                                    {
                                        browserRuntime.status
                                    }
                                </strong>

                            </div>


                            <div>

                                <span>
                                    Mode
                                </span>

                                <strong>
                                    {
                                        browserRuntime.mode
                                    }
                                </strong>

                            </div>


                            <div>

                                <span>
                                    Auth State
                                </span>

                                <strong>
                                    {
                                        browserRuntime.authState
                                    }
                                </strong>

                            </div>

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

                            <h3>
                                Validation Evidence
                            </h3>

                        </div>


                        <pre
                            className="
                                stagepilot-code-block
                            "
                        >

                            {
                                JSON.stringify(
                                    validation,
                                    null,
                                    2
                                )
                            }

                        </pre>

                    </div>

                </div>

            </section>

        </div>

    );

}

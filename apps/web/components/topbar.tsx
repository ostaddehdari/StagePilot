export function Topbar() {

    return (

        <header
            className="
                stagepilot-topbar
            "
        >

            <div>

                <div
                    className="
                        stagepilot-page-eyebrow
                    "
                >

                    مرکز فرماندهی

                </div>


                <h1
                    className="
                        stagepilot-page-title
                    "
                >

                    داشبورد StagePilot

                </h1>

            </div>


            <div
                className="
                    d-flex
                    align-items-center
                    gap-3
                "
            >

                <div
                    className="
                        d-none
                        d-md-block
                        text-end
                    "
                >

                    <div
                        className="
                            fw-semibold
                        "
                    >

                        مدیر سیستم

                    </div>


                    <div
                        className="
                            small
                            text-secondary
                        "
                    >

                        Private Console

                    </div>

                </div>


                <form
                    method="post"
                    action="/StagePilot/api/auth/logout"
                >

                    <button
                        type="submit"
                        className="
                            btn
                            btn-outline-secondary
                            stagepilot-logout-btn
                        "
                    >

                        خروج

                    </button>

                </form>

            </div>

        </header>

    );

}

type LoginPageProps = {

    searchParams: Promise<{

        error?: string;

    }>;

};


export default async function LoginPage({

    searchParams

}: LoginPageProps) {


    const params =
        await searchParams;


    const message =

        params.error === 'invalid'

            ? 'نام کاربری یا رمز عبور صحیح نیست.'

            : params.error === 'missing'

                ? 'نام کاربری و رمز عبور را وارد کنید.'

                : null;


    return (

        <main
            className="
                min-vh-100
                bg-body-tertiary
                d-flex
                align-items-center
            "
        >

            <div className="container">


                <div
                    className="
                        row
                        justify-content-center
                    "
                >


                    <div
                        className="
                            col-12
                            col-md-7
                            col-lg-5
                            col-xl-4
                        "
                    >


                        <div
                            className="
                                card
                                border-0
                                shadow-sm
                            "
                        >


                            <div
                                className="
                                    card-body
                                    p-4
                                    p-lg-5
                                "
                            >


                                <div
                                    className="
                                        text-center
                                        mb-4
                                    "
                                >


                                    <div
                                        className="
                                            fs-3
                                            fw-bold
                                        "
                                    >

                                        StagePilot

                                    </div>


                                    <div
                                        className="
                                            text-secondary
                                            mt-2
                                        "
                                    >

                                        ورود خصوصی مدیر

                                    </div>


                                </div>


                                {message && (

                                    <div
                                        className="
                                            alert
                                            alert-danger
                                        "
                                        role="alert"
                                    >

                                        {message}

                                    </div>

                                )}


                                <form
                                    method="post"
                                    action="/StagePilot/api/auth/login"
                                    className="d-grid gap-3"
                                >


                                    <div>


                                        <label
                                            htmlFor="username"
                                            className="form-label"
                                        >

                                            نام کاربری

                                        </label>


                                        <input
                                            id="username"
                                            name="username"
                                            type="text"
                                            className="form-control"
                                            autoComplete="username"
                                            required
                                            autoFocus
                                        />


                                    </div>


                                    <div>


                                        <label
                                            htmlFor="password"
                                            className="form-label"
                                        >

                                            رمز عبور

                                        </label>


                                        <input
                                            id="password"
                                            name="password"
                                            type="password"
                                            className="form-control"
                                            autoComplete="current-password"
                                            required
                                        />


                                    </div>


                                    <button
                                        type="submit"
                                        className="
                                            btn
                                            btn-dark
                                            btn-lg
                                        "
                                    >

                                        ورود

                                    </button>


                                </form>


                                <div
                                    className="
                                        small
                                        text-secondary
                                        mt-4
                                        text-center
                                    "
                                >

                                    StagePilot Private Console

                                </div>


                            </div>


                        </div>


                    </div>


                </div>


            </div>


        </main>

    );

}

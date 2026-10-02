export type DashboardEvent = {

    id: number;

    event_type: string;

    severity: string;

    actor_id: string | null;

    message: string | null;

    created_at: string;

};


export type DashboardSummary = {

    ok: boolean;

    generatedAt: string;

    counts: {

        projects: number;

        stages: number;

        works: number;

        prompts: number;

        runs: number;

        events: number;

        active_runs: number;

    };

    recentEvents: DashboardEvent[];

};


export async function loadDashboardSummary():
    Promise<DashboardSummary | null> {

    const base =
        process.env.STAGEPILOT_INTERNAL_API
        ??
        'http://127.0.0.1:19101';


    try {

        const response =
            await fetch(
                `${base}/dashboard/summary`,
                {
                    cache:
                        'no-store',

                    signal:
                        AbortSignal.timeout(
                            5000
                        )
                }
            );


        if (!response.ok) {

            return null;

        }


        return (
            await response.json()
        ) as DashboardSummary;

    } catch {

        return null;

    }

}

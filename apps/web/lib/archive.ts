export type ArchiveSummary = {

    counts: {

        prompts: number;

        responses: number;

        scripts: number;

        runs: number;

        logs: number;

        test_results: number;

        git_operations: number;

    };

    recentPrompts:
        Array<
            Record<
                string,
                unknown
            >
        >;

    recentRuns:
        Array<
            Record<
                string,
                unknown
            >
        >;

    recentGit:
        Array<
            Record<
                string,
                unknown
            >
        >;

};


function apiBase(): string {

    return (
        process.env
            .STAGEPILOT_INTERNAL_API
        ??
        'http://127.0.0.1:19101'
    );

}


function internalKey(): string {

    const key =
        process.env
            .STAGEPILOT_INTERNAL_KEY;


    if (!key) {

        throw new Error(
            'STAGEPILOT_INTERNAL_KEY missing'
        );

    }


    return key;

}


async function requestArchive(
    path: string
) {

    const response =
        await fetch(
            `${apiBase()}${path}`,
            {

                cache:
                    'no-store',

                headers: {

                    'x-stagepilot-internal-key':
                        internalKey()

                },

                signal:
                    AbortSignal.timeout(
                        10000
                    )

            }
        );


    if (
        response.status === 404
    ) {

        return null;

    }


    const body =
        await response.json();


    if (!response.ok) {

        throw new Error(
            body?.message
            ??
            `ARCHIVE_API_${response.status}`
        );

    }


    return body.archive;

}


export async function loadArchiveSummary():
    Promise<ArchiveSummary> {

    return (
        await requestArchive(
            '/archive/summary'
        )
    ) as ArchiveSummary;

}


export async function loadPromptArchive(
    id: string
) {

    return requestArchive(
        `/archive/prompts/${encodeURIComponent(id)}`
    );

}


export async function loadRunArchive(
    id: string
) {

    return requestArchive(
        `/archive/runs/${encodeURIComponent(id)}`
    );

}

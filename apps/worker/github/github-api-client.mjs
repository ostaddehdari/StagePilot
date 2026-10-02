import {
    readFile
} from 'node:fs/promises';

import {
    validateSecretFile,
    parseFileSecretRef
} from './github-access-validator.mjs';


export const GITHUB_API_BASE =
    'https://api.github.com';

export const GITHUB_API_VERSION =
    '2026-03-10';


export function validateRepositoryName(
    name
) {

    const value =
        String(
            name
            ??
            ''
        );


    if (
        !/^[A-Za-z0-9._-]{1,100}$/.test(
            value
        )
    ) {

        throw new Error(
            'INVALID_REPOSITORY_NAME'
        );

    }


    return value;

}


export function classifyGitHubFailure(
    status
) {

    switch (
        Number(
            status
        )
    ) {

        case 401:
            return 'AUTHENTICATION_FAILED';

        case 403:
            return 'PERMISSION_DENIED';

        case 404:
            return 'RESOURCE_NOT_FOUND_OR_NOT_AUTHORIZED';

        case 422:
            return 'VALIDATION_FAILED';

        default:
            return 'GITHUB_API_ERROR';

    }

}


async function loadToken(
    secretRef
) {

    const path =
        parseFileSecretRef(
            secretRef
        );


    await validateSecretFile(
        secretRef
    );


    const token =
        (
            await readFile(
                path,
                'utf8'
            )
        ).trim();


    if (
        !token.startsWith(
            'github_pat_'
        )
    ) {

        throw new Error(
            'EXPECTED_FINE_GRAINED_PAT'
        );

    }


    return token;

}


export async function githubRequest({

    secretRef,

    method = 'GET',

    path,

    body = undefined

}) {

    const token =
        await loadToken(
            secretRef
        );


    const url =
        new URL(
            path,
            GITHUB_API_BASE
        );


    const response =
        await fetch(
            url,
            {
                method,

                headers: {
                    Accept:
                        'application/vnd.github+json',

                    Authorization:
                        `Bearer ${token}`,

                    'X-GitHub-Api-Version':
                        GITHUB_API_VERSION,

                    'User-Agent':
                        'StagePilot/0.1'
                },

                body:
                    body === undefined
                        ? undefined
                        : JSON.stringify(
                            body
                        )
            }
        );


    const text =
        await response.text();


    let data =
        null;


    if (
        text.length > 0
    ) {

        try {

            data =
                JSON.parse(
                    text
                );

        } catch {

            data = {
                message:
                    'NON_JSON_RESPONSE'
            };

        }

    }


    return {
        ok:
            response.ok,

        status:
            response.status,

        data,

        rateLimitRemaining:
            response.headers.get(
                'x-ratelimit-remaining'
            ),

        acceptedOAuthScopes:
            response.headers.get(
                'x-accepted-oauth-scopes'
            ),

        oauthScopes:
            response.headers.get(
                'x-oauth-scopes'
            )
    };

}


export async function getAuthenticatedUser(
    secretRef
) {

    return githubRequest({
        secretRef,
        path:
            '/user'
    });

}


export async function getRepository(
    secretRef,
    owner,
    repository
) {

    return githubRequest({
        secretRef,
        path:
            `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}`
    });

}


export async function createRepository(
    secretRef,
    {
        name,
        description = '',
        isPrivate = true
    }
) {

    validateRepositoryName(
        name
    );


    return githubRequest({
        secretRef,

        method:
            'POST',

        path:
            '/user/repos',

        body: {
            name,

            description,

            private:
                Boolean(
                    isPrivate
                ),

            auto_init:
                false,

            has_issues:
                false,

            has_projects:
                false,

            has_wiki:
                false
        }
    });

}


export async function deleteRepository(
    secretRef,
    owner,
    repository
) {

    validateRepositoryName(
        repository
    );


    return githubRequest({
        secretRef,

        method:
            'DELETE',

        path:
            `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}`
    });

}

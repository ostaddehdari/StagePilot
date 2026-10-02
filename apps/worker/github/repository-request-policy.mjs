import {
    createHash
} from 'node:crypto';


export const MODES =
    new Set([
        'create',
        'attach'
    ]);


export const VISIBILITIES =
    new Set([
        'private',
        'public'
    ]);


export function normalizeRepositoryName(
    value
) {

    const name =
        String(
            value
            ??
            ''
        ).trim();


    if (
        !/^[A-Za-z0-9._-]{1,100}$/.test(
            name
        )
    ) {

        throw new Error(
            'INVALID_REPOSITORY_NAME'
        );

    }


    return name;

}


export function normalizeBranch(
    value
) {

    const branch =
        String(
            value
            ??
            'main'
        ).trim();


    if (
        !/^[A-Za-z0-9._/-]{1,200}$/.test(
            branch
        )
        ||
        branch.includes(
            '..'
        )
        ||
        branch.startsWith(
            '/'
        )
        ||
        branch.endsWith(
            '/'
        )
    ) {

        throw new Error(
            'INVALID_BRANCH'
        );

    }


    return branch;

}


export function normalizeRepositoryRequest(
    input
) {

    const mode =
        String(
            input?.mode
            ??
            ''
        ).trim();


    if (
        !MODES.has(
            mode
        )
    ) {

        throw new Error(
            'INVALID_REPOSITORY_MODE'
        );

    }


    const owner =
        String(
            input?.owner
            ??
            ''
        ).trim();


    if (
        !/^[A-Za-z0-9-]{1,39}$/.test(
            owner
        )
    ) {

        throw new Error(
            'INVALID_OWNER'
        );

    }


    const repositoryName =
        normalizeRepositoryName(
            input?.repositoryName
        );


    const visibility =
        String(
            input?.visibility
            ??
            'private'
        ).trim();


    if (
        !VISIBILITIES.has(
            visibility
        )
    ) {

        throw new Error(
            'INVALID_VISIBILITY'
        );

    }


    const defaultBranch =
        normalizeBranch(
            input?.defaultBranch
            ??
            'main'
        );


    return {
        mode,
        owner,
        repositoryName,
        visibility,
        defaultBranch
    };

}


export function canonicalRequestFingerprint(
    input
) {

    const normalized =
        normalizeRepositoryRequest(
            input
        );


    const canonical =
        JSON.stringify({
            mode:
                normalized.mode,

            owner:
                normalized.owner.toLowerCase(),

            repositoryName:
                normalized.repositoryName,

            visibility:
                normalized.visibility,

            defaultBranch:
                normalized.defaultBranch
        });


    return createHash(
        'sha256'
    )
        .update(
            canonical,
            'utf8'
        )
        .digest(
            'hex'
        );

}


export function ensureIdempotentReplay({
    storedFingerprint,
    incomingFingerprint
}) {

    if (
        storedFingerprint
        !==
        incomingFingerprint
    ) {

        throw new Error(
            'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_REQUEST'
        );

    }


    return true;

}


export function decideRepositoryAction({
    status,
    approved,
    existingBinding,
    githubRepositoryId = null
}) {

    if (
        existingBinding
    ) {

        return {
            action:
                'RETURN_EXISTING_BINDING',

            execute:
                false
        };

    }


    if (
        status
        ===
        'succeeded'
    ) {

        return {
            action:
                'RETURN_EXISTING_RESULT',

            execute:
                false
        };

    }


    if (
        status
        ===
        'executing'
        ||
        status
        ===
        'uncertain'
    ) {

        return {
            action:
                'RECONCILE_ONLY',

            execute:
                false
        };

    }


    if (
        githubRepositoryId
        !==
        null
    ) {

        return {
            action:
                'RECONCILE_REMOTE_IDENTITY',

            execute:
                false
        };

    }


    if (
        !approved
        ||
        status
        !==
        'approved'
    ) {

        return {
            action:
                'REQUIRE_APPROVAL',

            execute:
                false
        };

    }


    return {
        action:
            'EXECUTE_ONCE',

        execute:
            true
    };

}


export function validateExplicitVisibility({
    visibility,
    publicExplicitlyApproved = false
}) {

    if (
        visibility
        ===
        'public'
        &&
        publicExplicitlyApproved
        !==
        true
    ) {

        throw new Error(
            'PUBLIC_REPOSITORY_REQUIRES_EXPLICIT_APPROVAL'
        );

    }


    return true;

}

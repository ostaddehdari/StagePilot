import {
    createRepository,
    getRepository
} from './github-api-client.mjs';

import {
    normalizeRepositoryRequest,
    decideRepositoryAction,
    validateExplicitVisibility
} from './repository-request-policy.mjs';


function lower(
    value
) {

    return String(
        value
        ??
        ''
    ).toLowerCase();

}


export function repositoryIdentity(
    repository
) {

    return {

        id:
            repository?.id
            ??
            null,

        owner:
            repository?.owner?.login
            ??
            '',

        name:
            repository?.name
            ??
            '',

        fullName:
            repository?.full_name
            ??
            '',

        htmlUrl:
            repository?.html_url
            ??
            '',

        sshUrl:
            repository?.ssh_url
            ??
            '',

        private:
            repository?.private
            ===
            true,

        visibility:
            repository?.visibility
            ??
            (
                repository?.private
                    ? 'private'
                    : 'public'
            ),

        defaultBranch:
            repository?.default_branch
            ??
            'main'

    };

}


export function verifyExactRepositoryIdentity(
    request,
    repository
) {

    const normalized =
        normalizeRepositoryRequest(
            request
        );


    const identity =
        repositoryIdentity(
            repository
        );


    if (
        lower(
            identity.owner
        )
        !==
        lower(
            normalized.owner
        )
    ) {

        throw new Error(
            'REMOTE_OWNER_MISMATCH'
        );

    }


    if (
        lower(
            identity.name
        )
        !==
        lower(
            normalized.repositoryName
        )
    ) {

        throw new Error(
            'REMOTE_REPOSITORY_NAME_MISMATCH'
        );

    }


    const expectedFullName =
        `${normalized.owner}/${normalized.repositoryName}`;


    if (
        lower(
            identity.fullName
        )
        !==
        lower(
            expectedFullName
        )
    ) {

        throw new Error(
            'REMOTE_FULL_NAME_MISMATCH'
        );

    }


    if (
        !identity.id
    ) {

        throw new Error(
            'REMOTE_REPOSITORY_ID_MISSING'
        );

    }


    return identity;

}


export function verifyKnownRepositoryId(
    knownRepositoryId,
    identity
) {

    if (
        knownRepositoryId
        ===
        null
        ||
        knownRepositoryId
        ===
        undefined
    ) {

        return true;

    }


    if (
        String(
            knownRepositoryId
        )
        !==
        String(
            identity.id
        )
    ) {

        throw new Error(
            'REMOTE_REPOSITORY_ID_MISMATCH'
        );

    }


    return true;

}


export function bindingFromIdentity({
    request,
    identity,
    bindingMode
}) {

    const normalized =
        normalizeRepositoryRequest(
            request
        );


    return {

        githubRepositoryId:
            identity.id,

        ownerLogin:
            identity.owner,

        repositoryName:
            identity.name,

        fullName:
            identity.fullName,

        htmlUrl:
            identity.htmlUrl,

        sshUrl:
            identity.sshUrl,

        visibility:
            identity.visibility,

        defaultBranch:
            identity.defaultBranch
            ||
            normalized.defaultBranch,

        bindingMode,

        createdByStagePilot:
            bindingMode
            ===
            'created',

        status:
            'ready'

    };

}


export function executionDecision({
    request,
    existingBinding = null
}) {

    const normalized =
        normalizeRepositoryRequest(
            request
        );


    validateExplicitVisibility({
        visibility:
            normalized.visibility,

        publicExplicitlyApproved:
            request?.publicExplicitlyApproved
            ===
            true
    });


    const base =
        decideRepositoryAction({
            status:
                request?.status,

            approved:
                Boolean(
                    request?.approved
                ),

            existingBinding:
                Boolean(
                    existingBinding
                ),

            githubRepositoryId:
                request?.githubRepositoryId
                ??
                null
        });


    if (
        base.action
        ===
        'EXECUTE_ONCE'
    ) {

        return {

            action:
                normalized.mode
                ===
                'create'
                    ? 'EXECUTE_CREATE'
                    : 'EXECUTE_ATTACH',

            execute:
                true

        };

    }


    if (
        base.action
        ===
        'RECONCILE_ONLY'
        ||
        base.action
        ===
        'RECONCILE_REMOTE_IDENTITY'
    ) {

        return {

            action:
                normalized.mode
                ===
                'create'
                    ? 'RECONCILE_CREATE'
                    : 'RECONCILE_ATTACH',

            execute:
                false

        };

    }


    return base;

}


export async function inspectExactRepository({
    secretRef,
    request
}) {

    const normalized =
        normalizeRepositoryRequest(
            request
        );


    const response =
        await getRepository(
            secretRef,
            normalized.owner,
            normalized.repositoryName
        );


    if (
        response.status
        ===
        404
    ) {

        return {

            found:
                false,

            status:
                404,

            identity:
                null

        };

    }


    if (
        !response.ok
    ) {

        throw new Error(
            `GITHUB_LOOKUP_FAILED_${response.status}`
        );

    }


    const identity =
        verifyExactRepositoryIdentity(
            normalized,
            response.data
        );


    return {

        found:
            true,

        status:
            response.status,

        identity

    };

}


export async function executeApprovedRequest({
    secretRef,
    request,
    existingBinding = null
}) {

    const normalized =
        normalizeRepositoryRequest(
            request
        );


    const decision =
        executionDecision({
            request,
            existingBinding
        });


    if (
        decision.action
        ===
        'RETURN_EXISTING_BINDING'
    ) {

        return {

            outcome:
                'existing_binding',

            mutationAttempted:
                false,

            retryAllowed:
                false,

            binding:
                existingBinding

        };

    }


    if (
        decision.action
        ===
        'RETURN_EXISTING_RESULT'
    ) {

        return {

            outcome:
                'existing_result',

            mutationAttempted:
                false,

            retryAllowed:
                false

        };

    }


    if (
        decision.action
        ===
        'REQUIRE_APPROVAL'
    ) {

        return {

            outcome:
                'approval_required',

            mutationAttempted:
                false,

            retryAllowed:
                false

        };

    }


    if (
        decision.action
        ===
        'RECONCILE_CREATE'
        ||
        decision.action
        ===
        'RECONCILE_ATTACH'
    ) {

        const lookup =
            await inspectExactRepository({
                secretRef,
                request:
                    normalized
            });


        if (
            !lookup.found
        ) {

            return {

                outcome:
                    'reconcile_not_found',

                mutationAttempted:
                    false,

                retryAllowed:
                    false,

                requiresDecision:
                    true

            };

        }


        verifyKnownRepositoryId(
            request?.githubRepositoryId
            ??
            null,
            lookup.identity
        );


        return {

            outcome:
                'reconciled',

            mutationAttempted:
                false,

            retryAllowed:
                false,

            identity:
                lookup.identity,

            binding:
                bindingFromIdentity({
                    request:
                        normalized,

                    identity:
                        lookup.identity,

                    bindingMode:
                        normalized.mode
                        ===
                        'create'
                            ? 'created'
                            : 'attached'
                })

        };

    }


    if (
        decision.action
        ===
        'EXECUTE_ATTACH'
    ) {

        const lookup =
            await inspectExactRepository({
                secretRef,
                request:
                    normalized
            });


        if (
            !lookup.found
        ) {

            return {

                outcome:
                    'attach_target_not_found',

                mutationAttempted:
                    false,

                retryAllowed:
                    false

            };

        }


        return {

            outcome:
                'attached',

            mutationAttempted:
                false,

            retryAllowed:
                false,

            identity:
                lookup.identity,

            binding:
                bindingFromIdentity({
                    request:
                        normalized,

                    identity:
                        lookup.identity,

                    bindingMode:
                        'attached'
                })

        };

    }


    if (
        decision.action
        !==
        'EXECUTE_CREATE'
    ) {

        throw new Error(
            `UNSUPPORTED_EXECUTION_DECISION_${decision.action}`
        );

    }


    const before =
        await inspectExactRepository({
            secretRef,
            request:
                normalized
        });


    if (
        before.found
    ) {

        return {

            outcome:
                'name_conflict',

            mutationAttempted:
                false,

            retryAllowed:
                false,

            requiresDecision:
                true,

            identity:
                before.identity

        };

    }


    const created =
        await createRepository(
            secretRef,
            {
                name:
                    normalized.repositoryName,

                description:
                    `StagePilot project repository: ${normalized.repositoryName}`,

                isPrivate:
                    normalized.visibility
                    ===
                    'private'
            }
        );


    if (
        created.status
        ===
        201
    ) {

        const identity =
            verifyExactRepositoryIdentity(
                normalized,
                created.data
            );


        return {

            outcome:
                'created',

            mutationAttempted:
                true,

            retryAllowed:
                false,

            identity,

            binding:
                bindingFromIdentity({
                    request:
                        normalized,

                    identity,

                    bindingMode:
                        'created'
                })

        };

    }


    if (
        created.status
        ===
        422
    ) {

        return {

            outcome:
                'create_validation_or_name_conflict',

            mutationAttempted:
                true,

            retryAllowed:
                false,

            requiresReconciliation:
                true

        };

    }


    if (
        created.status
        ===
        401
        ||
        created.status
        ===
        403
    ) {

        return {

            outcome:
                'permission_denied',

            mutationAttempted:
                true,

            retryAllowed:
                false,

            status:
                created.status

        };

    }


    return {

        outcome:
            'create_uncertain',

        mutationAttempted:
            true,

        retryAllowed:
            false,

        requiresReconciliation:
            true,

        status:
            created.status

    };

}

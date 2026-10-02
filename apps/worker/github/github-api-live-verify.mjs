import {
    getAuthenticatedUser,
    getRepository,
    createRepository,
    deleteRepository,
    classifyGitHubFailure
} from './github-api-client.mjs';


function fail(
    code,
    detail = {}
) {

    const error =
        new Error(
            code
        );


    error.detail =
        detail;


    throw error;

}


async function verifyDeleted(
    secretRef,
    owner,
    repository
) {

    for (
        let attempt = 1;
        attempt <= 5;
        attempt += 1
    ) {

        const result =
            await getRepository(
                secretRef,
                owner,
                repository
            );


        if (
            result.status
            ===
            404
        ) {

            return true;

        }


        await new Promise(
            resolve =>
                setTimeout(
                    resolve,
                    1000
                )
        );

    }


    return false;

}


async function main() {

    const descriptor =
        JSON.parse(
            process.argv[2]
            ??
            '{}'
        );


    const {
        secretRef,
        expectedOwner,
        existingRepository,
        temporaryRepository,
        createDeleteTest = true
    } = descriptor;


    if (
        !secretRef
        ||
        !expectedOwner
        ||
        !existingRepository
    ) {

        fail(
            'INVALID_DESCRIPTOR'
        );

    }


    const user =
        await getAuthenticatedUser(
            secretRef
        );


    if (!user.ok) {

        fail(
            classifyGitHubFailure(
                user.status
            ),
            {
                endpoint:
                    '/user',

                status:
                    user.status
            }
        );

    }


    const login =
        String(
            user.data?.login
            ??
            ''
        );


    if (
        login.toLowerCase()
        !==
        expectedOwner.toLowerCase()
    ) {

        fail(
            'OWNER_IDENTITY_MISMATCH',
            {
                expected:
                    expectedOwner,

                actual:
                    login
            }
        );

    }


    const repository =
        await getRepository(
            secretRef,
            expectedOwner,
            existingRepository
        );


    if (!repository.ok) {

        fail(
            classifyGitHubFailure(
                repository.status
            ),
            {
                endpoint:
                    'existing-repository',

                status:
                    repository.status
            }
        );

    }


    const expectedFullName =
        `${expectedOwner}/${existingRepository}`;


    if (
        String(
            repository.data?.full_name
            ??
            ''
        ).toLowerCase()
        !==
        expectedFullName.toLowerCase()
    ) {

        fail(
            'REPOSITORY_IDENTITY_MISMATCH'
        );

    }


    let creationVerified =
        false;

    let deletionVerified =
        false;

    let temporaryRepositoryId =
        null;


    if (
        createDeleteTest
    ) {

        if (
            !temporaryRepository
        ) {

            fail(
                'TEMPORARY_REPOSITORY_REQUIRED'
            );

        }


        const before =
            await getRepository(
                secretRef,
                expectedOwner,
                temporaryRepository
            );


        if (
            before.status
            !==
            404
        ) {

            fail(
                'TEMPORARY_REPOSITORY_NAME_NOT_AVAILABLE',
                {
                    status:
                        before.status
                }
            );

        }


        const created =
            await createRepository(
                secretRef,
                {
                    name:
                        temporaryRepository,

                    description:
                        'Temporary StagePilot GitHub permission verification repository.',

                    isPrivate:
                        true
                }
            );


        if (
            created.status
            !==
            201
        ) {

            fail(
                classifyGitHubFailure(
                    created.status
                ),
                {
                    endpoint:
                        'create-repository',

                    status:
                        created.status
                }
            );

        }


        if (
            String(
                created.data?.owner?.login
                ??
                ''
            ).toLowerCase()
            !==
            expectedOwner.toLowerCase()
        ) {

            fail(
                'CREATED_REPOSITORY_OWNER_MISMATCH'
            );

        }


        if (
            created.data?.private
            !==
            true
        ) {

            fail(
                'TEMPORARY_REPOSITORY_NOT_PRIVATE'
            );

        }


        temporaryRepositoryId =
            created.data?.id
            ??
            null;


        creationVerified =
            true;


        const deleted =
            await deleteRepository(
                secretRef,
                expectedOwner,
                temporaryRepository
            );


        if (
            deleted.status
            !==
            204
        ) {

            fail(
                classifyGitHubFailure(
                    deleted.status
                ),
                {
                    endpoint:
                        'delete-repository',

                    status:
                        deleted.status,

                    temporaryRepository:
                        temporaryRepository
                }
            );

        }


        deletionVerified =
            await verifyDeleted(
                secretRef,
                expectedOwner,
                temporaryRepository
            );


        if (
            !deletionVerified
        ) {

            fail(
                'TEMPORARY_REPOSITORY_DELETE_NOT_CONFIRMED',
                {
                    temporaryRepository
                }
            );

        }

    }


    process.stdout.write(
        JSON.stringify({
            provider:
                'github',

            authenticated:
                true,

            ownerIdentityVerified:
                true,

            ownerLogin:
                login,

            ownerId:
                user.data?.id
                ??
                null,

            existingRepositoryVerified:
                true,

            existingRepository:
                expectedFullName,

            existingRepositoryId:
                repository.data?.id
                ??
                null,

            createPermissionVerified:
                creationVerified,

            administrationPermissionVerified:
                creationVerified
                &&
                deletionVerified,

            temporaryRepositoryDeleted:
                deletionVerified,

            temporaryRepositoryId,

            secretValueExposed:
                false
        })
    );

}


main()
    .catch(
        error => {

            process.stderr.write(
                JSON.stringify({
                    error:
                        error?.message
                        ??
                        'UNKNOWN_ERROR',

                    detail:
                        error?.detail
                        ??
                        {}
                })
            );

            process.exit(
                1
            );

        }
    );

import {
    createHash
} from 'node:crypto';


const SENSITIVE_KEY =
    /(password|passwd|secret|token|credential|private.?key|cookie|session|authorization|api.?key)/i;


const SERVER_LOCAL_KEY =
    /^(server|serverHost|serverPort|sshHost|sshPort|sshUser|workspacePath|localPath|runtimePath|browserProfile|browserProfilePath|vnc|novnc|deployKeyPath)$/i;


const FORBIDDEN_NORMAL_CONTENT = [
    /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
    /github_pat_[A-Za-z0-9_]{20,}/,
    /gh[pousr]_[A-Za-z0-9]{20,}/,
    /AKIA[0-9A-Z]{16}/,
    /\/opt\/stagepilot\/runtime(?:\/|$)/,
    /browser-profiles?\//i,
    /browser-sessions?\//i
];


const FORBIDDEN_GITIGNORE_SECRET_CONTENT = [
    /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
    /github_pat_[A-Za-z0-9_]{20,}/,
    /gh[pousr]_[A-Za-z0-9]{20,}/,
    /AKIA[0-9A-Z]{16}/
];


export const INITIAL_PACKAGE_PATHS =
    Object.freeze([
        '.gitignore',
        'README.md',
        'stagepilot/plan.json',
        'stagepilot/project.json'
    ]);


function cleanText(
    value
) {

    return String(
        value
        ??
        ''
    ).trim();

}


function requireText(
    value,
    code
) {

    const text =
        cleanText(
            value
        );


    if (!text) {

        throw new Error(
            code
        );

    }


    return text;

}


function sanitizeValue(
    value,
    seen = new WeakSet()
) {

    if (
        value === null
        ||
        value === undefined
        ||
        typeof value === 'string'
        ||
        typeof value === 'number'
        ||
        typeof value === 'boolean'
    ) {

        return value;

    }


    if (
        typeof value
        !==
        'object'
    ) {

        return undefined;

    }


    if (
        seen.has(
            value
        )
    ) {

        throw new Error(
            'CIRCULAR_METADATA_NOT_ALLOWED'
        );

    }


    seen.add(
        value
    );


    if (
        Array.isArray(
            value
        )
    ) {

        const result =
            value
                .map(
                    item =>
                        sanitizeValue(
                            item,
                            seen
                        )
                )
                .filter(
                    item =>
                        item
                        !==
                        undefined
                );


        seen.delete(
            value
        );


        return result;

    }


    const result = {};


    for (
        const [
            key,
            child
        ]
        of Object.entries(
            value
        )
    ) {

        if (
            SENSITIVE_KEY.test(
                key
            )
            ||
            SERVER_LOCAL_KEY.test(
                key
            )
        ) {

            continue;

        }


        const sanitized =
            sanitizeValue(
                child,
                seen
            );


        if (
            sanitized
            !==
            undefined
        ) {

            result[
                key
            ] =
                sanitized;

        }

    }


    seen.delete(
        value
    );


    return result;

}


export function sanitizeProjectObject(
    value
) {

    return sanitizeValue(
        value
    );

}


export function validateRepositoryContent(
    content,
    filePath = 'unknown'
) {

    const text =
        String(
            content
            ??
            ''
        );


    for (
        const pattern
        of FORBIDDEN_NORMAL_CONTENT
    ) {

        if (
            pattern.test(
                text
            )
        ) {

            throw new Error(
                `FORBIDDEN_REPOSITORY_CONTENT:${filePath}`
            );

        }

    }


    return true;

}


export function validateGitignoreContent(
    content
) {

    const text =
        String(
            content
            ??
            ''
        );


    const entries =
        new Set(
            text
                .split(
                    /\r?\n/
                )
                .map(
                    line =>
                        line.trim()
                )
                .filter(
                    line =>
                        line.length > 0
                        &&
                        !line.startsWith(
                            '#'
                        )
                )
        );


    const required = [
        '.env',
        '.env.*',
        '*.pem',
        '*.key',
        'runtime/',
        'storage/',
        'browser-profiles/',
        'browser-sessions/',
        'node_modules/',
        '.next/',
        'dist/',
        '*.log'
    ];


    for (
        const entry
        of required
    ) {

        if (
            !entries.has(
                entry
            )
        ) {

            throw new Error(
                `GITIGNORE_REQUIRED_ENTRY_MISSING:${entry}`
            );

        }

    }


    for (
        const pattern
        of FORBIDDEN_GITIGNORE_SECRET_CONTENT
    ) {

        if (
            pattern.test(
                text
            )
        ) {

            throw new Error(
                'GITIGNORE_CONTAINS_SECRET_MATERIAL'
            );

        }

    }


    return true;

}


export function defaultGitignore() {

    return [
        '# StagePilot managed repository',
        '',
        '# Secrets',
        '.env',
        '.env.*',
        '!.env.example',
        '*.pem',
        '*.key',
        '*.p12',
        '*.pfx',
        '',
        '# Runtime / persistent local state',
        'runtime/',
        'storage/',
        '.cache/',
        'tmp/',
        'temp/',
        '.config/',
        '.local/',
        '.stagepilot-project',
        '',
        '# Browser state',
        'browser-profiles/',
        'browser-sessions/',
        '',
        '# Dependencies / build output',
        'node_modules/',
        '**/node_modules/',
        '.next/',
        '**/.next/',
        'dist/',
        '**/dist/',
        'coverage/',
        '',
        '# Logs',
        '*.log',
        'logs/',
        '',
        '# Local databases and dumps',
        '*.sqlite',
        '*.sqlite3',
        '*.db',
        '*.dump',
        '',
        '# Editor / OS',
        '.DS_Store',
        'Thumbs.db',
        '.idea/',
        '.vscode/',
        ''
    ].join(
        '\n'
    );

}


export function createProjectSpecification({

    project,
    repository

}) {

    const specification = {

        schemaVersion:
            1,

        project: {

            id:
                requireText(
                    project?.id,
                    'PROJECT_ID_REQUIRED'
                ),

            slug:
                requireText(
                    project?.slug,
                    'PROJECT_SLUG_REQUIRED'
                ),

            name:
                requireText(
                    project?.name,
                    'PROJECT_NAME_REQUIRED'
                ),

            description:
                cleanText(
                    project?.description
                ),

            currentPlanRevision:
                Number(
                    project?.currentPlanRevision
                    ??
                    0
                )

        },

        repository: {

            provider:
                'github',

            fullName:
                requireText(
                    repository?.fullName,
                    'REPOSITORY_FULL_NAME_REQUIRED'
                ),

            visibility:
                repository?.visibility
                ===
                'public'
                    ? 'public'
                    : 'private',

            defaultBranch:
                cleanText(
                    repository?.defaultBranch
                    ??
                    'main'
                )

        },

        metadata:
            sanitizeProjectObject(
                project?.metadata
                ??
                {}
            )

    };


    validateRepositoryContent(
        JSON.stringify(
            specification
        ),
        'stagepilot/project.json'
    );


    return specification;

}


export function createPlanDocument({

    projectId,
    revision,
    plan

}) {

    const document = {

        schemaVersion:
            1,

        projectId:
            requireText(
                projectId,
                'PLAN_PROJECT_ID_REQUIRED'
            ),

        revision:
            Number(
                revision
                ??
                0
            ),

        plan:
            sanitizeProjectObject(
                plan
                ??
                {}
            )

    };


    validateRepositoryContent(
        JSON.stringify(
            document
        ),
        'stagepilot/plan.json'
    );


    return document;

}


export function createReadme(
    specification
) {

    const lines = [
        `# ${specification.project.name}`,
        ''
    ];


    if (
        specification.project.description
    ) {

        lines.push(
            specification.project.description,
            ''
        );

    }


    lines.push(
        '## StagePilot',
        '',
        'This repository was initialized from an approved StagePilot project plan.',
        '',
        `- Project ID: \`${specification.project.id}\``,
        `- Project slug: \`${specification.project.slug}\``,
        `- Repository: \`${specification.repository.fullName}\``,
        `- Default branch: \`${specification.repository.defaultBranch}\``,
        `- Plan revision: \`${specification.project.currentPlanRevision}\``,
        '',
        'Project planning metadata is stored under `stagepilot/`.',
        '',
        'Secrets, browser state, raw logs and server-local runtime settings are intentionally excluded.',
        ''
    );


    const content =
        lines.join(
            '\n'
        );


    validateRepositoryContent(
        content,
        'README.md'
    );


    return content;

}


export function createInitialRepositoryPackage({

    project,
    repository,
    plan

}) {

    const specification =
        createProjectSpecification({
            project,
            repository
        });


    const planDocument =
        createPlanDocument({
            projectId:
                specification.project.id,

            revision:
                specification.project.currentPlanRevision,

            plan
        });


    const files = {

        '.gitignore':
            defaultGitignore(),

        'README.md':
            createReadme(
                specification
            ),

        'stagepilot/project.json':
            JSON.stringify(
                specification,
                null,
                2
            )
            +
            '\n',

        'stagepilot/plan.json':
            JSON.stringify(
                planDocument,
                null,
                2
            )
            +
            '\n'

    };


    const actual =
        Object.keys(
            files
        ).sort();


    const expected =
        [
            ...INITIAL_PACKAGE_PATHS
        ].sort();


    if (
        JSON.stringify(
            actual
        )
        !==
        JSON.stringify(
            expected
        )
    ) {

        throw new Error(
            'INITIAL_PACKAGE_FILE_SET_MISMATCH'
        );

    }


    for (
        const [
            filePath,
            content
        ]
        of Object.entries(
            files
        )
    ) {

        if (
            filePath
            ===
            '.gitignore'
        ) {

            validateGitignoreContent(
                content
            );

        } else {

            validateRepositoryContent(
                content,
                filePath
            );

        }

    }


    const manifest = {};


    for (
        const [
            filePath,
            content
        ]
        of Object.entries(
            files
        )
    ) {

        manifest[
            filePath
        ] = {

            bytes:
                Buffer.byteLength(
                    content,
                    'utf8'
                ),

            sha256:
                createHash(
                    'sha256'
                )
                    .update(
                        content,
                        'utf8'
                    )
                    .digest(
                        'hex'
                    )

        };

    }


    return {

        files,

        manifest,

        safety: {

            sanitized:
                true,

            secretsIncluded:
                false,

            rawLogsIncluded:
                false,

            browserProfilesIncluded:
                false,

            serverLocalSettingsIncluded:
                false

        }

    };

}

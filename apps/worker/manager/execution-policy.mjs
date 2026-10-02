import {
    createHash
} from 'node:crypto';


export function sha256(
    value
) {

    return createHash(
        'sha256'
    )
        .update(
            String(value),
            'utf8'
        )
        .digest(
            'hex'
        );

}


export function validateScriptDescriptor(
    script
) {

    const errors = [];


    if (
        !script
        ||
        typeof script !== 'object'
    ) {

        return {
            ok: false,
            errors: ['script descriptor missing']
        };

    }


    if (
        script.status !== 'approved'
    ) {

        errors.push(
            'script-not-approved'
        );

    }


    if (
        !Number.isInteger(script.position)
        ||
        script.position < 1
    ) {

        errors.push(
            'invalid-position'
        );

    }


    if (
        typeof script.filename !== 'string'
        ||
        !script.filename
        ||
        script.filename.includes('/')
        ||
        script.filename.includes('\\')
        ||
        script.filename.includes('\0')
    ) {

        errors.push(
            'unsafe-filename'
        );

    }


    if (
        typeof script.content !== 'string'
        ||
        !script.content
    ) {

        errors.push(
            'empty-content'
        );

    }


    if (
        typeof script.sha256 !== 'string'
        ||
        sha256(script.content) !== script.sha256
    ) {

        errors.push(
            'sha256-mismatch'
        );

    }


    const dependsOn =
        Array.isArray(script.dependsOn)
            ? script.dependsOn
            : [];


    for (
        const dependency
        of dependsOn
    ) {

        if (
            !Number.isInteger(dependency)
            ||
            dependency < 1
            ||
            dependency >= script.position
        ) {

            errors.push(
                `invalid-dependency:${dependency}`
            );

        }

    }


    return {

        ok:
            errors.length === 0,

        errors

    };

}


export function canRunScript(
    {
        batchStatus,
        script,
        completedPositions = []
    }
) {

    if (
        batchStatus !== 'approved'
    ) {

        return {
            allowed: false,
            reason: 'batch-not-approved'
        };

    }


    const validation =
        validateScriptDescriptor(
            script
        );


    if (!validation.ok) {

        return {
            allowed: false,
            reason: validation.errors.join(',')
        };

    }


    const completed =
        new Set(
            completedPositions
        );


    for (
        const dependency
        of (
            script.dependsOn
            ??
            []
        )
    ) {

        if (
            !completed.has(
                dependency
            )
        ) {

            return {
                allowed: false,
                reason:
                    `dependency-not-completed:${dependency}`
            };

        }

    }


    return {
        allowed: true,
        reason: 'approved'
    };

}

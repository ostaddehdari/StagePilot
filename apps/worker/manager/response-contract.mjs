import {
    validateProjectPlanEnvelope
} from './project-plan-contract.mjs';

import {
    validateProjectProposalEnvelope
} from './project-proposal-contract.mjs';


export const RESPONSE_TYPES =
    Object.freeze([

        'script_batch',

        'report_only',

        'decision_required',

        'project_proposal',

        'project_plan'

    ]);


export function normalizeText(
    value
) {

    return String(
        value
        ??
        ''
    )
        .replace(
            /\r\n/g,
            '\n'
        )
        .trim();

}


function isObject(
    value
) {

    return (
        value !== null
        &&
        typeof value === 'object'
        &&
        !Array.isArray(
            value
        )
    );

}


function validateScript(
    script,
    index
) {

    const errors = [];


    if (!isObject(script)) {

        return [
            `scripts[${index}] must be an object`
        ];

    }


    if (
        !Number.isInteger(
            script.order
        )
        ||
        script.order < 1
    ) {

        errors.push(
            `scripts[${index}].order must be a positive integer`
        );

    }


    if (
        typeof script.name !== 'string'
        ||
        !script.name.trim()
    ) {

        errors.push(
            `scripts[${index}].name is required`
        );

    }


    if (
        typeof script.language !== 'string'
        ||
        !script.language.trim()
    ) {

        errors.push(
            `scripts[${index}].language is required`
        );

    }


    if (
        typeof script.content !== 'string'
        ||
        !script.content.trim()
    ) {

        errors.push(
            `scripts[${index}].content is required`
        );

    }


    if (
        script.dependsOn !== undefined
        &&
        (
            !Array.isArray(
                script.dependsOn
            )
            ||
            script.dependsOn.some(
                value =>
                    !Number.isInteger(
                        value
                    )
                    ||
                    value < 1
            )
        )
    ) {

        errors.push(
            `scripts[${index}].dependsOn must contain positive integer orders`
        );

    }


    return errors;

}


export function validateResponseEnvelope(
    envelope
) {

    const errors = [];


    if (!isObject(envelope)) {

        return {

            ok:
                false,

            errors: [
                'response envelope must be an object'
            ]

        };

    }


    if (
        !RESPONSE_TYPES.includes(
            envelope.responseType
        )
    ) {

        errors.push(
            `unsupported responseType: ${String(envelope.responseType)}`
        );

    }


    if (
        typeof envelope.summary !== 'string'
    ) {

        errors.push(
            'summary must be a string'
        );

    }


    if (
        envelope.responseType
        ===
        'script_batch'
    ) {

        if (
            !Array.isArray(
                envelope.scripts
            )
            ||
            envelope.scripts.length === 0
        ) {

            errors.push(
                'script_batch requires at least one script'
            );

        } else {

            envelope.scripts.forEach(
                (
                    script,
                    index
                ) => {

                    errors.push(
                        ...validateScript(
                            script,
                            index
                        )
                    );

                }
            );


            const orders =
                envelope.scripts
                    .map(
                        script =>
                            script?.order
                    );


            const uniqueOrders =
                new Set(
                    orders
                );


            if (
                uniqueOrders.size
                !==
                orders.length
            ) {

                errors.push(
                    'script orders must be unique'
                );

            }

        }

    }


    if (
        envelope.responseType
        ===
        'report_only'
        &&
        Array.isArray(
            envelope.scripts
        )
        &&
        envelope.scripts.length > 0
    ) {

        errors.push(
            'report_only must not contain executable scripts'
        );

    }


    if (
        envelope.responseType
        ===
        'decision_required'
    ) {

        if (
            typeof envelope.decision?.question
            !==
            'string'
            ||
            !envelope.decision.question.trim()
        ) {

            errors.push(
                'decision_required requires decision.question'
            );

        }


        if (
            !Array.isArray(
                envelope.decision?.options
            )
            ||
            envelope.decision.options.length < 2
        ) {

            errors.push(
                'decision_required requires at least two decision options'
            );

        }

    }


    if (
        envelope.responseType
        ===
        'project_proposal'
    ) {

        try {

            validateProjectProposalEnvelope(
                envelope
            );

        } catch (error) {

            errors.push(
                error instanceof Error
                    ? error.message
                    : 'INVALID_PROJECT_PROPOSAL'
            );

        }

    }


    if (
        envelope.responseType
        ===
        'project_plan'
    ) {

        try {

            validateProjectPlanEnvelope(
                envelope
            );

        } catch (error) {

            errors.push(
                error instanceof Error
                    ? error.message
                    : 'INVALID_PROJECT_PLAN'
            );

        }

    }


    return {

        ok:
            errors.length === 0,

        errors

    };

}


export function assertValidResponseEnvelope(
    envelope
) {

    const result =
        validateResponseEnvelope(
            envelope
        );


    if (!result.ok) {

        throw new Error(
            [
                'INVALID_AI_RESPONSE_CONTRACT',
                ...result.errors
            ].join(
                ': '
            )
        );

    }


    return envelope;

}

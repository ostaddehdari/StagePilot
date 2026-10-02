import {
    createHash
} from 'node:crypto';


export const PROMPT_TYPES =
    Object.freeze({

        PROJECT_PLAN:
            'project_plan',

        WORK_EXECUTION:
            'work_execution',

        FAILURE_DIAGNOSIS:
            'failure_diagnosis',

        CONTINUE_AFTER_REPORT:
            'continue_after_report',

        CONVERSATION_HANDOFF:
            'conversation_handoff'

    });


function normalize(
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


export function sha256(
    value
) {

    return createHash(
        'sha256'
    )
        .update(
            String(
                value
            ),
            'utf8'
        )
        .digest(
            'hex'
        );

}


export function buildManagerPrompt({

    type,

    projectName,

    objective,

    stage = null,

    work = null,

    subwork = null,

    verifiedState = '',

    failureContext = '',

    continuationContext = ''

}) {

    const sections = [

        'STAGEPILOT_MANAGER_PROTOCOL_V1',

        `PROMPT_TYPE: ${type}`,

        `PROJECT: ${normalize(projectName)}`,

        `OBJECTIVE:\n${normalize(objective)}`

    ];


    if (stage) {

        sections.push(
            `STAGE: ${normalize(stage)}`
        );

    }


    if (work) {

        sections.push(
            `WORK: ${normalize(work)}`
        );

    }


    if (subwork) {

        sections.push(
            `SUBWORK: ${normalize(subwork)}`
        );

    }


    if (verifiedState) {

        sections.push(
            `VERIFIED_STATE:\n${normalize(verifiedState)}`
        );

    }


    if (failureContext) {

        sections.push(
            `FAILURE_CONTEXT:\n${normalize(failureContext)}`
        );

    }


    if (continuationContext) {

        sections.push(
            `CONTINUATION_CONTEXT:\n${normalize(continuationContext)}`
        );

    }


    sections.push(
`RESPONSE_CONTRACT:

Return exactly one JSON object.

Allowed responseType values:
- script_batch
- report_only
- decision_required

For script_batch:
{
  "responseType": "script_batch",
  "summary": "...",
  "scripts": [
    {
      "order": 1,
      "name": "...",
      "language": "bash",
      "content": "...",
      "dependsOn": []
    }
  ]
}

For report_only:
{
  "responseType": "report_only",
  "summary": "...",
  "scripts": []
}

For decision_required:
{
  "responseType": "decision_required",
  "summary": "...",
  "decision": {
    "question": "...",
    "options": ["...", "..."]
  },
  "scripts": []
}

Rules:
1. Do not invent execution results.
2. Do not claim tests passed unless VERIFIED_STATE says they passed.
3. Do not silently skip the requested Stage/Work/SubWork.
4. A script_batch must contain scripts in executable order.
5. dependsOn contains script order numbers only.
6. Management/diagnostic work is not project progress.
7. If essential information is missing, use decision_required.
8. Do not include Markdown fences around the JSON object.`
    );


    const text =
        sections.join(
            '\n\n'
        );


    return {

        type,

        text,

        sha256:
            sha256(
                text
            ),

        version:
            1

    };

}

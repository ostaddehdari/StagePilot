import {
    createHash
} from 'node:crypto';


import {
    chmod,
    rename,
    writeFile
} from 'node:fs/promises';


import {
    setTimeout as sleep
} from 'node:timers/promises';


function normalizeText(
    value
) {

    return String(
        value
        ??
        ''
    )
        .replace(
            /\u00a0/g,
            ' '
        )
        .replace(
            /\s+/g,
            ' '
        )
        .trim();

}


function sha256(
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


function conversationIdFromUrl(
    value
) {

    try {

        const url =
            new URL(
                value
            );


        const match =
            url.pathname.match(
                /\/c\/([^/?#]+)/
            );


        return match
            ? match[1]
            : null;

    } catch {

        return null;

    }

}


function parseUnitKey(
    key
) {

    const match =
        String(
            key
            ??
            ''
        )
            .match(
                /^(.*):(\d+):(user|assistant)$/
            );


    if (!match) {

        return null;

    }


    return {

        key:
            match[0],

        groupKey:
            match[1],

        sequence:
            Number(
                match[2]
            ),

        role:
            match[3]

    };

}


async function atomicJson(
    path,
    value
) {

    const temp =
        `${path}.${process.pid}.tmp`;


    await writeFile(
        temp,
        JSON.stringify(
            value,
            null,
            2
        )
        +
        '\n',
        {
            mode:
                0o600
        }
    );


    await rename(
        temp,
        path
    );


    await chmod(
        path,
        0o600
    );

}


async function messageSnapshot(
    page
) {

    return await page.evaluate(
        () => {

            const normalize =
                value =>
                    String(
                        value
                        ??
                        ''
                    )
                        .replace(
                            /\u00a0/g,
                            ' '
                        )
                        .replace(
                            /\s+/g,
                            ' '
                        )
                        .trim();


            /*
             * DOM observed during S04/W04-A2:
             *
             * user:
             *   data-chatgpt-search-unit-key="...:0:user"
             *
             * assistant:
             *   data-chatgpt-search-unit-key="...:2:assistant"
             *
             * ChatGPT currently also exposes equivalent
             * data-content-search-unit-key attributes.
             */
            const selectors = [

                '[data-chatgpt-search-unit-key]',

                '[data-content-search-unit-key]'

            ];


            const elements = [];


            const seen =
                new Set();


            for (
                const selector
                of selectors
            ) {

                for (
                    const element
                    of document.querySelectorAll(
                        selector
                    )
                ) {

                    if (
                        seen.has(
                            element
                        )
                    ) {

                        continue;

                    }


                    seen.add(
                        element
                    );


                    const key =
                        element.getAttribute(
                            'data-chatgpt-search-unit-key'
                        )
                        ??
                        element.getAttribute(
                            'data-content-search-unit-key'
                        )
                        ??
                        '';


                    if (
                        !/:\d+:(user|assistant)$/
                            .test(
                                key
                            )
                    ) {

                        continue;

                    }


                    const role =
                        key.endsWith(
                            ':user'
                        )
                        ? 'user'
                        : 'assistant';


                    let content =
                        null;


                    if (
                        role
                        ===
                        'user'
                    ) {

                        content =
                            element.querySelector(
                                '[data-user-message-bubble="true"]'
                            )
                            ??
                            element.querySelector(
                                '.text-size-chat.whitespace-pre-wrap'
                            )
                            ??
                            element;

                    } else {

                        content =
                            element.querySelector(
                                '[data-markdown-text-style="assistant-message"]'
                            )
                            ??
                            element.querySelector(
                                '[data-chatgpt-selection-message-id]'
                            )
                            ??
                            element;

                    }


                    const selectionNode =
                        role === 'assistant'
                        ? (
                            element.querySelector(
                                '[data-chatgpt-selection-message-id]'
                            )
                            ??
                            (
                                element.hasAttribute(
                                    'data-chatgpt-selection-message-id'
                                )
                                ? element
                                : null
                            )
                        )
                        : null;


                    elements.push({

                        key,

                        role,

                        text:
                            normalize(
                                content?.innerText
                                ??
                                content?.textContent
                                ??
                                ''
                            ),

                        searchMessageIds:
                            element.getAttribute(
                                'data-chatgpt-search-message-ids'
                            )
                            ??
                            '',

                        conversationId:
                            selectionNode
                                ?.getAttribute(
                                    'data-chatgpt-selection-conversation-id'
                                )
                            ??
                            '',

                        messageId:
                            (
                                selectionNode
                                    ?.getAttribute(
                                        'data-chatgpt-selection-message-id'
                                    )
                                ||
                                ''
                            )
                            ||
                            (
                                (
                                    element
                                        .getAttribute(
                                            'data-chatgpt-search-message-ids'
                                        )
                                    ||
                                    ''
                                )
                                    .trim()
                                    .split(
                                        /\\s+/
                                    )
                                    .filter(
                                        Boolean
                                    )[0]
                                ||
                                ''
                            )

                    });

                }

            }


            const stopSelectors = [

                'button[data-testid="stop-button"]',

                'button[data-testid*="stop" i]',

                'button[aria-label*="stop generating" i]',

                'button[aria-label*="stop streaming" i]'

            ];


            let streaming =
                false;


            const streamingEvidence = [];


            for (
                const selector
                of stopSelectors
            ) {

                try {

                    const visible =
                        Array.from(
                            document.querySelectorAll(
                                selector
                            )
                        )
                            .filter(
                                element => {

                                    const rect =
                                        element
                                            .getBoundingClientRect();


                                    return (
                                        rect.width > 0
                                        &&
                                        rect.height > 0
                                    );

                                }
                            );


                    if (
                        visible.length > 0
                    ) {

                        streaming =
                            true;


                        streamingEvidence.push({

                            selector,

                            count:
                                visible.length

                        });

                    }

                } catch {}

            }


            return {

                url:
                    location.href,

                title:
                    document.title,

                units:
                    elements,

                streaming,

                streamingEvidence

            };

        }
    );

}


function correlateUnits(
    snapshot,
    expectedPromptText
) {

    const expected =
        normalizeText(
            expectedPromptText
        );


    const parsed =
        snapshot.units
            .map(
                unit => ({

                    ...unit,

                    parsed:
                        parseUnitKey(
                            unit.key
                        )

                })
            )
            .filter(
                unit =>
                    Boolean(
                        unit.parsed
                    )
            );


    /*
     * Find exact user request.
     */
    const user =
        parsed.find(
            unit =>
                unit.role
                ===
                'user'
                &&
                normalizeText(
                    unit.text
                )
                ===
                expected
        )
        ??
        parsed.find(
            unit =>
                unit.role
                ===
                'user'
                &&
                normalizeText(
                    unit.text
                )
                    .includes(
                        expected
                    )
        );


    if (!user) {

        return {

            correlated:
                false,

            reason:
                'matching-user-unit-not-found',

            user:
                null,

            assistant:
                null

        };

    }


    /*
     * Highest-confidence correlation:
     *
     * same ChatGPT turn group + assistant sequence after
     * the matching user sequence.
     */
    const sameGroupAssistants =
        parsed
            .filter(
                unit =>
                    unit.role
                    ===
                    'assistant'
                    &&
                    unit.parsed.groupKey
                    ===
                    user.parsed.groupKey
                    &&
                    unit.parsed.sequence
                    >
                    user.parsed.sequence
            )
            .sort(
                (
                    left,
                    right
                ) =>
                    left.parsed.sequence
                    -
                    right.parsed.sequence
            );


    let assistant =
        sameGroupAssistants[0]
        ??
        null;


    /*
     * Conservative fallback for a future DOM variant:
     * first assistant unit after the matching user unit.
     */
    if (!assistant) {

        const userPosition =
            parsed.indexOf(
                user
            );


        assistant =
            parsed
                .slice(
                    userPosition + 1
                )
                .find(
                    unit =>
                        unit.role
                        ===
                        'assistant'
                )
            ??
            null;

    }


    if (!assistant) {

        return {

            correlated:
                true,

            reason:
                'assistant-unit-not-started',

            user,

            assistant:
                null

        };

    }


    return {

        correlated:
            true,

        reason:
            assistant.parsed.groupKey
            ===
            user.parsed.groupKey
            ? 'same-turn-group'
            : 'ordered-assistant-fallback',

        user,

        assistant

    };

}


export async function diagnoseResponseDom({

    page,

    expectedPromptText

}) {

    const snapshot =
        await messageSnapshot(
            page
        );


    const correlation =
        correlateUnits(
            snapshot,
            expectedPromptText
        );


    return {

        url:
            snapshot.url,

        title:
            snapshot.title,

        unitCount:
            snapshot.units.length,

        streaming:
            snapshot.streaming,

        units:
            snapshot.units.map(
                unit => ({

                    key:
                        unit.key,

                    role:
                        unit.role,

                    textLength:
                        unit.text.length,

                    textSha256:
                        unit.text
                        ? sha256(
                            unit.text
                        )
                        : null,

                    preview:
                        unit.text.slice(
                            0,
                            240
                        ),

                    conversationId:
                        unit.conversationId,

                    messageId:
                        unit.messageId

                })
            ),

        correlation: {

            correlated:
                correlation.correlated,

            reason:
                correlation.reason,

            userKey:
                correlation.user?.key
                ??
                null,

            assistantKey:
                correlation.assistant?.key
                ??
                null

        }

    };

}


export async function inspectCorrelatedResponse({

    page,

    operationId,

    expectedPromptText,

    provisionalConversationId = null

}) {

    const snapshot =
        await messageSnapshot(
            page
        );


    const correlation =
        correlateUnits(
            snapshot,
            expectedPromptText
        );


    const assistantText =
        normalizeText(
            correlation
                .assistant
                ?.text
            ??
            ''
        );


    const observedConversationId =
        correlation
            .assistant
            ?.conversationId
        ||
        conversationIdFromUrl(
            snapshot.url
        );


    return {

        operationId,

        state:
            assistantText
            ? (
                snapshot.streaming
                ? 'STREAMING'
                : 'STABILIZING'
            )
            : 'WAITING_RESPONSE',

        correlated:
            correlation.correlated,

        reason:
            correlation.reason,

        provisionalConversationId,

        observedConversationId,

        observedUrl:
            snapshot.url,

        userUnitKey:
            correlation
                .user
                ?.key
            ??
            null,

        userMessageIds:
            correlation
                .user
                ?.searchMessageIds
            ??
            null,

        assistantUnitKey:
            correlation
                .assistant
                ?.key
            ??
            null,

        assistantMessageId:
            correlation
                .assistant
                ?.messageId
            ??
            null,

        responseLength:
            assistantText.length,

        responseSha256:
            assistantText
            ? sha256(
                assistantText
            )
            : null,

        responseText:
            assistantText,

        streaming:
            snapshot.streaming,

        streamingEvidence:
            snapshot.streamingEvidence,

        unitCount:
            snapshot.units.length,

        checkedAt:
            new Date()
                .toISOString()

    };

}


export async function waitForCorrelatedResponse({

    page,

    operationId,

    expectedPromptText,

    provisionalConversationId = null,

    responseStatePath,

    timeoutMs = 30000

}) {

    const deadline =
        Date.now()
        +
        timeoutMs;


    let lastHash =
        null;


    let stableSamples =
        0;


    let last =
        null;


    while (
        Date.now()
        <
        deadline
    ) {

        last =
            await inspectCorrelatedResponse({

                page,

                operationId,

                expectedPromptText,

                provisionalConversationId

            });


        if (
            !last.correlated
        ) {

            last.state =
                'WAITING_CORRELATION';


            await atomicJson(
                responseStatePath,
                last
            );


            await sleep(
                750
            );

            continue;

        }


        if (
            !last.responseText
        ) {

            last.state =
                'WAITING_RESPONSE';


            await atomicJson(
                responseStatePath,
                last
            );


            await sleep(
                750
            );

            continue;

        }


        if (
            last.streaming
        ) {

            stableSamples =
                0;


            lastHash =
                last.responseSha256;


            last.state =
                'STREAMING';


            await atomicJson(
                responseStatePath,
                last
            );


            await sleep(
                750
            );

            continue;

        }


        if (
            last.responseSha256
            ===
            lastHash
        ) {

            stableSamples +=
                1;

        } else {

            lastHash =
                last.responseSha256;


            stableSamples =
                1;

        }


        last.state =
            'STABILIZING';


        last.stableSamples =
            stableSamples;


        await atomicJson(
            responseStatePath,
            last
        );


        if (
            stableSamples >= 3
        ) {

            const completed = {

                ...last,

                state:
                    'RESPONSE_COMPLETED',

                stableSamples,

                completedAt:
                    new Date()
                        .toISOString()

            };


            await atomicJson(
                responseStatePath,
                completed
            );


            return completed;

        }


        await sleep(
            750
        );

    }


    const timeout = {

        ...(
            last
            ??
            {
                operationId,

                provisionalConversationId

            }
        ),

        state:
            'RESPONSE_TIMEOUT',

        timedOutAt:
            new Date()
                .toISOString()

    };


    await atomicJson(
        responseStatePath,
        timeout
    );


    return timeout;

}


export async function findConversationByTitle({

    page,

    title

}) {

    const normalized =
        normalizeText(
            title
        );


    if (!normalized) {

        return {

            found:
                false,

            reason:
                'empty-title'

        };

    }


    const result =
        await page.evaluate(
            expected => {

                const normalize =
                    value =>
                        String(
                            value
                            ??
                            ''
                        )
                            .replace(
                                /\s+/g,
                                ' '
                            )
                            .trim();


                const links =
                    Array.from(
                        document.querySelectorAll(
                            'a[href*="/c/"]'
                        )
                    );


                const exact =
                    links.find(
                        link =>
                            normalize(
                                link.innerText
                                ??
                                link.textContent
                            )
                            ===
                            expected
                    );


                if (!exact) {

                    return null;

                }


                return {

                    href:
                        exact.href,

                    text:
                        normalize(
                            exact.innerText
                            ??
                            exact.textContent
                        )

                };

            },
            normalized
        );


    return result
        ? {

            found:
                true,

            ...result

        }
        : {

            found:
                false,

            reason:
                'title-not-found'

        };

}

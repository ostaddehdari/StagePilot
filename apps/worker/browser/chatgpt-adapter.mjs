import {
    createHash
} from 'node:crypto';


import {
    createServer
} from 'node:net';


import {
    chmod,
    mkdir,
    readFile,
    rename,
    rm,
    writeFile
} from 'node:fs/promises';


import {
    join
} from 'node:path';


import {
    setTimeout as sleep
} from 'node:timers/promises';


import {
    CHATGPT_SELECTOR_REGISTRY,
    selectorRegistrySnapshot
} from './chatgpt-selectors.mjs';


import {
    diagnoseResponseDom,
    findConversationByTitle,
    inspectCorrelatedResponse,
    waitForCorrelatedResponse
} from './chatgpt-response-monitor.mjs';


import {
    inspectKnownMessageDom
} from './chatgpt-dom-forensics.mjs';


const ADAPTER_ROOT =
    process.env
        .STAGEPILOT_BROWSER_ADAPTER_ROOT
    ??
    '/opt/stagepilot/runtime/browser-adapter';


function validateProfileKey(
    profileKey
) {

    if (
        typeof profileKey !== 'string'
        ||
        !/^[A-Za-z0-9][A-Za-z0-9._-]{2,120}$/
            .test(
                profileKey
            )
    ) {

        throw new Error(
            'INVALID_PROFILE_KEY'
        );

    }

}


function validateOperationId(
    operationId
) {

    if (
        typeof operationId !== 'string'
        ||
        !/^[A-Za-z0-9][A-Za-z0-9._:-]{5,160}$/
            .test(
                operationId
            )
    ) {

        throw new Error(
            'INVALID_OPERATION_ID'
        );

    }

}


function validatePromptText(
    text
) {

    if (
        typeof text !== 'string'
        ||
        text.length < 1
        ||
        text.length > 10000
    ) {

        throw new Error(
            'INVALID_PROMPT_TEXT'
        );

    }

}


function sha256(
    value
) {

    return createHash(
        'sha256'
    )
        .update(
            value,
            'utf8'
        )
        .digest(
            'hex'
        );

}


function normalizeError(
    error
) {

    return {

        ok:
            false,

        error:
            error instanceof Error
            ? error.message
            : String(
                error
            )

    };

}


function parseChatGPTLocation(
    rawUrl
) {

    const url =
        new URL(
            rawUrl
        );


    const host =
        url.hostname
            .toLowerCase();


    const validHost =
        host === 'chatgpt.com'
        ||
        host.endsWith(
            '.chatgpt.com'
        );


    if (!validHost) {

        return {

            validChatGPT:
                false,

            routeType:
                'external',

            conversationId:
                null,

            pathname:
                url.pathname

        };

    }


    const conversationMatch =
        url.pathname.match(
            /\/c\/([^/?#]+)/
        );


    if (conversationMatch) {

        return {

            validChatGPT:
                true,

            routeType:
                'conversation',

            conversationId:
                conversationMatch[1],

            pathname:
                url.pathname,

            projectScoped:
                url.pathname.includes(
                    '/g/'
                )

        };

    }


    if (
        url.pathname === '/'
        ||
        url.pathname === ''
    ) {

        return {

            validChatGPT:
                true,

            routeType:
                'new-chat',

            conversationId:
                null,

            pathname:
                url.pathname,

            projectScoped:
                false

        };

    }


    return {

        validChatGPT:
            true,

        routeType:
            'other',

        conversationId:
            null,

        pathname:
            url.pathname,

        projectScoped:
            url.pathname.includes(
                '/g/'
            )

    };

}


function normalizeConversationUrl(
    raw
) {

    if (
        typeof raw !== 'string'
        ||
        raw.length < 10
        ||
        raw.length > 4096
    ) {

        throw new Error(
            'INVALID_CONVERSATION_URL'
        );

    }


    const url =
        new URL(
            raw
        );


    if (
        url.protocol !== 'https:'
        ||
        url.hostname !== 'chatgpt.com'
    ) {

        throw new Error(
            'CONVERSATION_URL_NOT_ALLOWED'
        );

    }


    const route =
        parseChatGPTLocation(
            url.href
        );


    if (
        route.routeType
        !==
        'conversation'
        ||
        !route.conversationId
    ) {

        throw new Error(
            'CONVERSATION_URL_ROUTE_INVALID'
        );

    }


    url.hash =
        '';


    return {

        href:
            url.href,

        conversationId:
            route.conversationId

    };

}


async function selectorObservation(
    page
) {

    return await page.evaluate(
        registry => {

            const result = {};


            for (
                const [
                    group,
                    selectors
                ]
                of Object.entries(
                    registry
                )
            ) {

                if (!Array.isArray(selectors)) {

                    continue;

                }


                const matches = [];


                for (
                    const selector
                    of selectors
                ) {

                    try {

                        matches.push({

                            selector,

                            count:
                                document
                                    .querySelectorAll(
                                        selector
                                    )
                                    .length

                        });

                    } catch {

                        matches.push({

                            selector,

                            count:
                                0,

                            invalid:
                                true

                        });

                    }

                }


                result[group] = {

                    total:
                        matches.reduce(
                            (
                                sum,
                                item
                            ) =>
                                sum
                                +
                                item.count,
                            0
                        ),

                    matches

                };

            }


            return result;

        },
        CHATGPT_SELECTOR_REGISTRY
    );

}


async function inspectPage(
    page
) {

    const observation =
        await selectorObservation(
            page
        );


    const hrefs =
        await page.evaluate(
            () =>
                Array.from(
                    new Set(
                        Array.from(
                            document.querySelectorAll(
                                'a[href*="/c/"]'
                            )
                        )
                            .map(
                                anchor =>
                                    anchor.href
                            )
                            .filter(
                                href =>
                                    typeof href === 'string'
                                    &&
                                    href.startsWith(
                                        'https://chatgpt.com/'
                                    )
                            )
                    )
                )
                    .slice(
                        0,
                        100
                    )
        );


    return {

        url:
            page.url(),

        title:
            await page
                .title()
                .catch(
                    () => ''
                ),

        route:
            parseChatGPTLocation(
                page.url()
            ),

        selectors:
            observation,

        conversationHrefCount:
            hrefs.length,

        conversationHrefs:
            hrefs,

        privacy: {

            bodyTextCaptured:
                false,

            historicalMessageTextCaptured:
                false

        }

    };

}


async function waitAfterNavigation(
    page
) {

    await sleep(
        1500
    );


    await page
        .waitForFunction(
            () =>
                document.readyState
                ===
                'complete'
                ||
                document.readyState
                ===
                'interactive',
            {
                timeout:
                    15000
            }
        )
        .catch(
            () => {}
        );


    await sleep(
        500
    );

}


async function navigateNewChat(
    page
) {

    await page.goto(
        'https://chatgpt.com/',
        {
            waitUntil:
                'domcontentloaded',

            timeout:
                45000
        }
    );


    await waitAfterNavigation(
        page
    );


    const snapshot =
        await inspectPage(
            page
        );


    if (
        snapshot.route.routeType
        !==
        'new-chat'
    ) {

        throw new Error(
            `NEW_CHAT_NOT_CONFIRMED:${snapshot.url}`
        );

    }


    return snapshot;

}


async function openConversation(
    page,
    rawUrl
) {

    const expected =
        normalizeConversationUrl(
            rawUrl
        );


    await page.goto(
        expected.href,
        {
            waitUntil:
                'domcontentloaded',

            timeout:
                45000
        }
    );


    await waitAfterNavigation(
        page
    );


    const snapshot =
        await inspectPage(
            page
        );


    if (
        snapshot.route.routeType
        !==
        'conversation'
    ) {

        throw new Error(
            `CONVERSATION_NOT_CONFIRMED:${snapshot.url}`
        );

    }


    if (
        snapshot.route.conversationId
        !==
        expected.conversationId
    ) {

        throw new Error(
            'CONVERSATION_IDENTITY_MISMATCH'
        );

    }


    return {

        expectedConversationId:
            expected.conversationId,

        actualConversationId:
            snapshot
                .route
                .conversationId,

        identityConfirmed:
            true,

        snapshot

    };

}


async function firstComposer(
    page
) {

    for (
        const selector
        of CHATGPT_SELECTOR_REGISTRY.composer
    ) {

        const handles =
            await page.$$(
                selector
            );


        for (
            const handle
            of handles
        ) {

            const usable =
                await page.evaluate(
                    element => {

                        const rect =
                            element
                                .getBoundingClientRect();


                        const visible =
                            (
                                rect.width > 0
                                &&
                                rect.height > 0
                            );


                        const disabled =
                            Boolean(
                                element.disabled
                            )
                            ||
                            element.getAttribute(
                                'aria-disabled'
                            )
                            ===
                            'true';


                        return (
                            visible
                            &&
                            !disabled
                        );

                    },
                    handle
                );


            if (usable) {

                return {

                    selector,

                    handle

                };

            }


            await handle.dispose();

        }

    }


    return null;

}


async function composerText(
    page,
    handle
) {

    return await page.evaluate(
        element => {

            if (
                element instanceof HTMLTextAreaElement
                ||
                element instanceof HTMLInputElement
            ) {

                return element.value
                ??
                '';

            }


            return element.innerText
                ??
                element.textContent
                ??
                '';

        },
        handle
    );

}


async function firstSendButton(
    page
) {

    for (
        const selector
        of CHATGPT_SELECTOR_REGISTRY.send
    ) {

        const handles =
            await page.$$(
                selector
            );


        for (
            const handle
            of handles
        ) {

            const status =
                await page.evaluate(
                    element => {

                        const rect =
                            element
                                .getBoundingClientRect();


                        const visible =
                            rect.width > 0
                            &&
                            rect.height > 0;


                        const disabled =
                            Boolean(
                                element.disabled
                            )
                            ||
                            element.getAttribute(
                                'aria-disabled'
                            )
                            ===
                            'true';


                        return {

                            visible,

                            disabled,

                            ariaLabel:
                                element.getAttribute(
                                    'aria-label'
                                )
                                ||
                                '',

                            testId:
                                element.getAttribute(
                                    'data-testid'
                                )
                                ||
                                ''

                        };

                    },
                    handle
                );


            if (
                status.visible
                &&
                !status.disabled
            ) {

                return {

                    selector,

                    handle,

                    status

                };

            }


            await handle.dispose();

        }

    }


    return null;

}


async function waitForSendButton(
    page,
    timeoutMs = 10000
) {

    const deadline =
        Date.now()
        +
        timeoutMs;


    while (
        Date.now()
        <
        deadline
    ) {

        const button =
            await firstSendButton(
                page
            );


        if (button) {

            return button;

        }


        await sleep(
            250
        );

    }


    return null;

}


async function writeJsonAtomic(
    path,
    data
) {

    const temp =
        `${path}.${process.pid}.tmp`;


    await writeFile(
        temp,
        JSON.stringify(
            data,
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


async function readJson(
    path
) {

    try {

        return JSON.parse(
            await readFile(
                path,
                'utf8'
            )
        );

    } catch (
        error
    ) {

        if (
            error?.code
            ===
            'ENOENT'
        ) {

            return null;

        }


        throw error;

    }

}


async function draftPrompt({
    page,
    statePath,
    operationId,
    text
}) {

    validateOperationId(
        operationId
    );


    validatePromptText(
        text
    );


    const existing =
        await readJson(
            statePath
        );


    if (
        existing
        &&
        existing.operationId
        ===
        operationId
    ) {

        if (
            existing.state
            ===
            'SENT_CONFIRMED'
        ) {

            return {

                ...existing,

                idempotent:
                    true,

                noActionTaken:
                    true

            };

        }


        if (
            [
                'SEND_INTENT',
                'CLICK',
                'SEND_UNCERTAIN'
            ].includes(
                existing.state
            )
        ) {

            throw new Error(
                `OPERATION_NOT_SAFE_TO_REDRAFT:${existing.state}`
            );

        }

    }


    const route =
        parseChatGPTLocation(
            page.url()
        );


    if (
        route.routeType
        !==
        'new-chat'
    ) {

        throw new Error(
            `DRAFT_REQUIRES_NEW_CHAT:${page.url()}`
        );

    }


    const composer =
        await firstComposer(
            page
        );


    if (!composer) {

        throw new Error(
            'COMPOSER_NOT_FOUND'
        );

    }


    await composer
        .handle
        .focus();


    /*
     * Do not use keyboard.press('Control+A').
     *
     * Puppeteer's Keyboard.press() expects a single
     * supported KeyInput, not a chord string.
     *
     * Select the existing Composer content through
     * the DOM Selection API, then issue one ordinary
     * Backspace key.
     */
    await page.evaluate(
        element => {

            element.focus();


            if (
                element instanceof HTMLTextAreaElement
                ||
                element instanceof HTMLInputElement
            ) {

                element.select();

                return;

            }


            const selection =
                window.getSelection();


            if (!selection) {

                throw new Error(
                    'WINDOW_SELECTION_UNAVAILABLE'
                );

            }


            const range =
                document.createRange();


            range.selectNodeContents(
                element
            );


            selection.removeAllRanges();


            selection.addRange(
                range
            );

        },
        composer.handle
    );


    await page
        .keyboard
        .press(
            'Backspace'
        );


    await page
        .keyboard
        .type(
            text,
            {
                delay:
                    1
            }
        );


    await sleep(
        500
    );


    const actualText =
        await composerText(
            page,
            composer.handle
        );


    await composer
        .handle
        .dispose();


    const expectedHash =
        sha256(
            text
        );


    const actualHash =
        sha256(
            actualText
        );


    if (
        actualHash
        !==
        expectedHash
    ) {

        throw new Error(
            `DRAFT_HASH_MISMATCH:${expectedHash}:${actualHash}`
        );

    }


    const sendButton =
        await waitForSendButton(
            page,
            10000
        );


    const state = {

        operationId,

        state:
            'DRAFT',

        promptHash:
            expectedHash,

        promptLength:
            text.length,

        draftUrl:
            page.url(),

        composerSelector:
            composer.selector,

        sendCandidateFound:
            Boolean(
                sendButton
            ),

        sendSelector:
            sendButton
                ?.selector
            ??
            null,

        clickCount:
            0,

        createdAt:
            new Date()
                .toISOString(),

        updatedAt:
            new Date()
                .toISOString()

    };


    if (sendButton) {

        await sendButton
            .handle
            .dispose();

    }


    await writeJsonAtomic(
        statePath,
        state
    );


    return state;

}


async function commitPrompt({
    page,
    statePath,
    operationId
}) {

    validateOperationId(
        operationId
    );


    const state =
        await readJson(
            statePath
        );


    if (!state) {

        throw new Error(
            'SEND_STATE_NOT_FOUND'
        );

    }


    if (
        state.operationId
        !==
        operationId
    ) {

        throw new Error(
            'OPERATION_ID_MISMATCH'
        );

    }


    if (
        state.state
        ===
        'SENT_CONFIRMED'
    ) {

        return {

            ...state,

            idempotent:
                true,

            duplicateClickPrevented:
                true,

            noActionTaken:
                true

        };

    }


    if (
        [
            'SEND_INTENT',
            'CLICK',
            'SEND_UNCERTAIN'
        ].includes(
            state.state
        )
    ) {

        throw new Error(
            `AUTOMATIC_RETRY_FORBIDDEN:${state.state}`
        );

    }


    if (
        state.state
        !==
        'DRAFT'
    ) {

        throw new Error(
            `INVALID_SEND_STATE:${state.state}`
        );

    }


    const composer =
        await firstComposer(
            page
        );


    if (!composer) {

        throw new Error(
            'COMPOSER_NOT_FOUND_BEFORE_SEND'
        );

    }


    const currentText =
        await composerText(
            page,
            composer.handle
        );


    await composer
        .handle
        .dispose();


    const currentHash =
        sha256(
            currentText
        );


    if (
        currentHash
        !==
        state.promptHash
    ) {

        throw new Error(
            'COMPOSER_CHANGED_AFTER_DRAFT'
        );

    }


    const sendButton =
        await waitForSendButton(
            page,
            10000
        );


    if (!sendButton) {

        throw new Error(
            'SEND_BUTTON_NOT_AVAILABLE_PRECLICK'
        );

    }


    const sendIntent = {

        ...state,

        state:
            'SEND_INTENT',

        sendSelector:
            sendButton.selector,

        sendIntentAt:
            new Date()
                .toISOString(),

        updatedAt:
            new Date()
                .toISOString()

    };


    await writeJsonAtomic(
        statePath,
        sendIntent
    );


    /*
     * Critical safety rule:
     *
     * CLICK is persisted BEFORE invoking click().
     *
     * Therefore a crash at or after this point can never
     * lead to an automatic retry.
     */
    const clickState = {

        ...sendIntent,

        state:
            'CLICK',

        clickCount:
            (
                sendIntent.clickCount
                ??
                0
            )
            +
            1,

        clickStartedAt:
            new Date()
                .toISOString(),

        updatedAt:
            new Date()
                .toISOString()

    };


    await writeJsonAtomic(
        statePath,
        clickState
    );


    try {

        await sendButton
            .handle
            .click();

    } catch (
        error
    ) {

        await sendButton
            .handle
            .dispose()
            .catch(
                () => {}
            );


        const uncertain = {

            ...clickState,

            state:
                'SEND_UNCERTAIN',

            reason:
                'click-error',

            clickError:
                error instanceof Error
                ? error.message
                : String(
                    error
                ),

            updatedAt:
                new Date()
                    .toISOString()

        };


        await writeJsonAtomic(
            statePath,
            uncertain
        );


        return uncertain;

    }


    await sendButton
        .handle
        .dispose();


    const deadline =
        Date.now()
        +
        45000;


    while (
        Date.now()
        <
        deadline
    ) {

        const route =
            parseChatGPTLocation(
                page.url()
            );


        if (
            route.routeType
            ===
            'conversation'
            &&
            route.conversationId
        ) {

            const confirmed = {

                ...clickState,

                state:
                    'SENT_CONFIRMED',

                conversationId:
                    route.conversationId,

                conversationUrl:
                    page.url(),

                sentConfirmedAt:
                    new Date()
                        .toISOString(),

                updatedAt:
                    new Date()
                        .toISOString()

            };


            await writeJsonAtomic(
                statePath,
                confirmed
            );


            return confirmed;

        }


        await sleep(
            250
        );

    }


    const uncertain = {

        ...clickState,

        state:
            'SEND_UNCERTAIN',

        reason:
            'conversation-route-not-confirmed',

        observedUrl:
            page.url(),

        updatedAt:
            new Date()
                .toISOString()

    };


    await writeJsonAtomic(
        statePath,
        uncertain
    );


    return uncertain;

}


export async function startChatGPTAdapter({

    page,

    profileKey,

    accountId = null

}) {

    validateProfileKey(
        profileKey
    );


    await mkdir(
        ADAPTER_ROOT,
        {
            recursive:
                true,

            mode:
                0o700
        }
    );


    const socketPath =
        join(
            ADAPTER_ROOT,
            `${profileKey}.sock`
        );


    const sendStatePath =
        join(
            ADAPTER_ROOT,
            `${profileKey}.send-state.json`
        );


    await rm(
        socketPath,
        {
            force:
                true
        }
    );


    let closing =
        false;


    const handle =
        async request => {

            const action =
                String(
                    request?.action
                    ??
                    ''
                );


            if (
                action
                ===
                'health'
            ) {

                return {

                    ok:
                        true,

                    adapter:
                        'chatgpt-browser-adapter',

                    version:
                        4,

                    stage:
                        'S04/W04-A',

                    sendStateMachine:
                        true,

                    automaticRetryAfterClick:
                        false,

                    profileKey,

                    accountId,

                    page: {

                        url:
                            page.url(),

                        title:
                            await page
                                .title()
                                .catch(
                                    () => ''
                                )

                    }

                };

            }


            if (
                action
                ===
                'selectors'
            ) {

                return {

                    ok:
                        true,

                    registry:
                        selectorRegistrySnapshot(),

                    observation:
                        await selectorObservation(
                            page
                        )

                };

            }


            if (
                action
                ===
                'inspect'
                ||
                action
                ===
                'navigation'
            ) {

                return {

                    ok:
                        true,

                    snapshot:
                        await inspectPage(
                            page
                        )

                };

            }


            if (
                action
                ===
                'conversations'
            ) {

                const snapshot =
                    await inspectPage(
                        page
                    );


                return {

                    ok:
                        true,

                    count:
                        snapshot
                            .conversationHrefCount,

                    hrefs:
                        snapshot
                            .conversationHrefs

                };

            }


            if (
                action
                ===
                'new-chat'
            ) {

                return {

                    ok:
                        true,

                    navigationState:
                        'NEW_CHAT_CONFIRMED',

                    snapshot:
                        await navigateNewChat(
                            page
                        )

                };

            }


            if (
                action
                ===
                'open-conversation'
            ) {

                return {

                    ok:
                        true,

                    navigationState:
                        'CONVERSATION_CONFIRMED',

                    ...await openConversation(
                        page,
                        request?.url
                    )

                };

            }


            if (
                action
                ===
                'send-state'
            ) {

                return {

                    ok:
                        true,

                    state:
                        await readJson(
                            sendStatePath
                        )

                };

            }


            if (
                action
                ===
                'draft'
            ) {

                return {

                    ok:
                        true,

                    transition:
                        'DRAFT',

                    state:
                        await draftPrompt({

                            page,

                            statePath:
                                sendStatePath,

                            operationId:
                                request?.operationId,

                            text:
                                request?.text

                        })

                };

            }


            if (
                action
                ===
                'commit-send'
            ) {

                const state =
                    await commitPrompt({

                        page,

                        statePath:
                            sendStatePath,

                        operationId:
                            request?.operationId

                    });


                return {

                    ok:
                        true,

                    transition:
                        state.state,

                    state

                };

            }


            if (
                action
                ===
                'targeted-dom-forensics'
            ) {

                return {

                    ok:
                        true,

                    diagnostic:
                        await inspectKnownMessageDom({

                            page,

                            promptText:
                                request?.promptText,

                            responseMarker:
                                request?.responseMarker

                        })

                };

            }


            if (
                action
                ===
                'response-dom-diagnostic'
            ) {

                return {

                    ok:
                        true,

                    diagnostic:
                        await diagnoseResponseDom({

                            page,

                            expectedPromptText:
                                request?.expectedPromptText

                        })

                };

            }


            if (
                action
                ===
                'response-status'
            ) {

                return {

                    ok:
                        true,

                    response:
                        await inspectCorrelatedResponse({

                            page,

                            operationId:
                                request?.operationId,

                            expectedPromptText:
                                request?.expectedPromptText,

                            provisionalConversationId:
                                request?.provisionalConversationId
                                ??
                                null

                        })

                };

            }


            if (
                action
                ===
                'wait-response'
            ) {

                return {

                    ok:
                        true,

                    response:
                        await waitForCorrelatedResponse({

                            page,

                            operationId:
                                request?.operationId,

                            expectedPromptText:
                                request?.expectedPromptText,

                            provisionalConversationId:
                                request?.provisionalConversationId
                                ??
                                null,

                            responseStatePath:
                                request?.responseStatePath,

                            timeoutMs:
                                Number(
                                    request?.timeoutMs
                                    ??
                                    120000
                                )

                        })

                };

            }


            if (
                action
                ===
                'find-conversation-title'
            ) {

                return {

                    ok:
                        true,

                    result:
                        await findConversationByTitle({

                            page,

                            title:
                                request?.title

                        })

                };

            }


            throw new Error(
                `ACTION_NOT_SUPPORTED:${action}`
            );

        };


    const server =
        createServer(
            socket => {

                socket.setEncoding(
                    'utf8'
                );


                let buffer =
                    '';


                let processed =
                    false;


                const respond =
                    value => {

                        if (processed) {

                            return;

                        }


                        processed =
                            true;


                        socket.end(
                            JSON.stringify(
                                value
                            )
                            +
                            '\n'
                        );

                    };


                socket.on(
                    'data',
                    chunk => {

                        if (processed) {

                            return;

                        }


                        buffer +=
                            chunk;


                        if (
                            !buffer.includes(
                                '\n'
                            )
                        ) {

                            if (
                                buffer.length
                                >
                                131072
                            ) {

                                respond({

                                    ok:
                                        false,

                                    error:
                                        'REQUEST_TOO_LARGE'

                                });

                            }


                            return;

                        }


                        const line =
                            buffer
                                .split(
                                    '\n'
                                )[0]
                                .trim();


                        void (
                            async () => {

                                try {

                                    respond(
                                        await handle(
                                            JSON.parse(
                                                line
                                            )
                                        )
                                    );

                                } catch (
                                    error
                                ) {

                                    respond(
                                        normalizeError(
                                            error
                                        )
                                    );

                                }

                            }
                        )();

                    }
                );


                socket.setTimeout(
                    180000,
                    () => {

                        respond({

                            ok:
                                false,

                            error:
                                'REQUEST_TIMEOUT'

                        });

                    }
                );

            }
        );


    await new Promise(
        (
            resolve,
            reject
        ) => {

            server.once(
                'error',
                reject
            );


            server.listen(
                socketPath,
                () => {

                    server.off(
                        'error',
                        reject
                    );


                    resolve();

                }
            );

        }
    );


    await chmod(
        socketPath,
        0o600
    );


    return {

        socketPath,

        version:
            3,

        async close() {

            if (closing) {

                return;

            }


            closing =
                true;


            await new Promise(
                resolve => {

                    server.close(
                        () =>
                            resolve()
                    );

                }
            )
                .catch(
                    () => {}
                );


            await rm(
                socketPath,
                {
                    force:
                        true
                }
            );

        }

    };

}

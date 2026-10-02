function normalize(
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


export async function inspectKnownMessageDom({

    page,

    promptText,

    responseMarker

}) {

    return await page.evaluate(
        ({
            promptText,
            responseMarker
        }) => {

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


            const prompt =
                normalize(
                    promptText
                );


            const response =
                normalize(
                    responseMarker
                );


            const elementMeta =
                element => {

                    const attributes = {};


                    for (
                        const attribute
                        of Array.from(
                            element.attributes
                            ??
                            []
                        )
                    ) {

                        if (
                            attribute.name === 'class'
                            ||
                            attribute.name === 'id'
                            ||
                            attribute.name === 'role'
                            ||
                            attribute.name === 'aria-label'
                            ||
                            attribute.name === 'data-testid'
                            ||
                            attribute.name.startsWith(
                                'data-'
                            )
                        ) {

                            attributes[
                                attribute.name
                            ] =
                                String(
                                    attribute.value
                                    ??
                                    ''
                                )
                                    .slice(
                                        0,
                                        300
                                    );

                        }

                    }


                    return {

                        tag:
                            element.tagName
                                .toLowerCase(),

                        attributes,

                        childCount:
                            element.children
                                .length,

                        textLength:
                            normalize(
                                element.innerText
                                ??
                                element.textContent
                                ??
                                ''
                            )
                                .length

                    };

                };


            const ancestorChain =
                element => {

                    const chain = [];


                    let current =
                        element;


                    let depth =
                        0;


                    while (
                        current
                        &&
                        current instanceof HTMLElement
                        &&
                        depth < 10
                    ) {

                        chain.push({
                            depth,
                            ...elementMeta(
                                current
                            )
                        });


                        current =
                            current.parentElement;


                        depth +=
                            1;

                    }


                    return chain;

                };


            const body =
                document.body;


            const allElements =
                Array.from(
                    body
                        ?.querySelectorAll(
                            '*'
                        )
                    ??
                    []
                );


            /*
             * Smallest exact/near-exact elements are much more
             * useful than body/main ancestors containing the
             * entire conversation.
             */
            const makeCandidates =
                (
                    needle,
                    mode
                ) => {

                    if (!needle) {

                        return [];

                    }


                    return allElements
                        .map(
                            element => {

                                const text =
                                    normalize(
                                        element.innerText
                                        ??
                                        element.textContent
                                        ??
                                        ''
                                    );


                                let score =
                                    0;


                                if (
                                    text
                                    ===
                                    needle
                                ) {

                                    score =
                                        1000;

                                } else if (
                                    text.startsWith(
                                        needle
                                    )
                                    &&
                                    text.length
                                    <=
                                    needle.length + 160
                                ) {

                                    score =
                                        800;

                                } else if (
                                    text.includes(
                                        needle
                                    )
                                    &&
                                    text.length
                                    <=
                                    needle.length + 400
                                ) {

                                    score =
                                        600;

                                } else {

                                    return null;

                                }


                                score -=
                                    Math.min(
                                        300,
                                        Math.max(
                                            0,
                                            text.length
                                            -
                                            needle.length
                                        )
                                    );


                                return {

                                    mode,

                                    score,

                                    text:
                                        text.slice(
                                            0,
                                            600
                                        ),

                                    element:
                                        elementMeta(
                                            element
                                        ),

                                    ancestors:
                                        ancestorChain(
                                            element
                                        )

                                };

                            }
                        )
                        .filter(
                            Boolean
                        )
                        .sort(
                            (
                                left,
                                right
                            ) =>
                                right.score
                                -
                                left.score
                        )
                        .slice(
                            0,
                            12
                        );

                };


            const promptCandidates =
                makeCandidates(
                    prompt,
                    'prompt'
                );


            const responseCandidates =
                makeCandidates(
                    response,
                    'response'
                );


            /*
             * Also inspect text nodes. This helps when React
             * wraps message text in many anonymous spans/divs.
             */
            const textNodeMatches = [];


            const walker =
                document.createTreeWalker(
                    body,
                    NodeFilter.SHOW_TEXT
                );


            let node;


            while (
                (
                    node =
                        walker.nextNode()
                )
                &&
                textNodeMatches.length < 30
            ) {

                const value =
                    normalize(
                        node.nodeValue
                    );


                if (!value) {

                    continue;

                }


                const matchesPrompt =
                    prompt
                    &&
                    (
                        value === prompt
                        ||
                        value.includes(
                            prompt
                        )
                    );


                const matchesResponse =
                    response
                    &&
                    (
                        value === response
                        ||
                        value.includes(
                            response
                        )
                    );


                if (
                    !matchesPrompt
                    &&
                    !matchesResponse
                ) {

                    continue;

                }


                const parent =
                    node.parentElement;


                if (!parent) {

                    continue;

                }


                textNodeMatches.push({

                    type:
                        matchesPrompt
                        ? 'prompt'
                        : 'response',

                    value:
                        value.slice(
                            0,
                            600
                        ),

                    parent:
                        elementMeta(
                            parent
                        ),

                    ancestors:
                        ancestorChain(
                            parent
                        )

                });

            }


            /*
             * Structural census: attributes currently present
             * in the rendered ChatGPT conversation.
             * No unrelated conversation text is returned.
             */
            const structural = {

                mainCount:
                    document.querySelectorAll(
                        'main'
                    )
                        .length,

                articleCount:
                    document.querySelectorAll(
                        'article'
                    )
                        .length,

                roleArticleCount:
                    document.querySelectorAll(
                        '[role="article"]'
                    )
                        .length,

                dataTestIdCount:
                    document.querySelectorAll(
                        '[data-testid]'
                    )
                        .length,

                messageAuthorRoleCount:
                    document.querySelectorAll(
                        '[data-message-author-role]'
                    )
                        .length,

                messageIdCount:
                    document.querySelectorAll(
                        '[data-message-id]'
                    )
                        .length,

                turnSubstringCount:
                    document.querySelectorAll(
                        '[data-testid*="turn" i]'
                    )
                        .length,

                messageSubstringCount:
                    document.querySelectorAll(
                        '[data-testid*="message" i]'
                    )
                        .length,

                markdownCount:
                    document.querySelectorAll(
                        '.markdown,[class*="markdown"]'
                    )
                        .length,

                proseCount:
                    document.querySelectorAll(
                        '[class*="prose"]'
                    )
                        .length

            };


            const usefulTestIds =
                Array.from(
                    document.querySelectorAll(
                        '[data-testid]'
                    )
                )
                    .map(
                        element =>
                            element.getAttribute(
                                'data-testid'
                            )
                    )
                    .filter(
                        Boolean
                    )
                    .filter(
                        value =>
                            /turn|message|conversation|assistant|user|response|composer|prompt/i
                                .test(
                                    value
                                )
                    )
                    .filter(
                        (
                            value,
                            index,
                            array
                        ) =>
                            array.indexOf(
                                value
                            )
                            ===
                            index
                    )
                    .slice(
                        0,
                        100
                    );


            return {

                url:
                    location.href,

                title:
                    document.title,

                readyState:
                    document.readyState,

                promptFound:
                    promptCandidates.length
                    > 0
                    ||
                    textNodeMatches.some(
                        item =>
                            item.type
                            ===
                            'prompt'
                    ),

                responseFound:
                    responseCandidates.length
                    > 0
                    ||
                    textNodeMatches.some(
                        item =>
                            item.type
                            ===
                            'response'
                    ),

                promptCandidates,

                responseCandidates,

                textNodeMatches,

                structural,

                usefulTestIds

            };

        },
        {
            promptText,

            responseMarker

        }
    );

}

export const CHATGPT_SELECTOR_REGISTRY =
    Object.freeze({

        version:
            's04-w02-v1',

        composer: [

            '#prompt-textarea',

            '[data-testid="prompt-textarea"]',

            'div[role="textbox"][contenteditable="true"]',

            '[contenteditable="true"][data-lexical-editor="true"]',

            'textarea'

        ],

        send: [

            'button[data-testid="send-button"]',

            'button[data-testid*="send" i]',

            'button[data-testid*="submit" i]',

            'button[aria-label*="send" i]'

        ],

        newChat: [

            'a[data-testid*="new-chat" i]',

            'button[data-testid*="new-chat" i]',

            'a[aria-label*="new chat" i]',

            'button[aria-label*="new chat" i]',

            'a[href="/"]'

        ],

        conversationLink: [

            'a[href*="/c/"]'

        ],

        profile: [

            '[data-testid="profile-button"]',

            '[data-testid="accounts-profile-button"]',

            '[data-testid*="profile" i]',

            'button[aria-label*="profile" i]',

            'button[aria-label*="account" i]'

        ]

    });


export function selectorRegistrySnapshot() {

    return JSON.parse(
        JSON.stringify(
            CHATGPT_SELECTOR_REGISTRY
        )
    );

}

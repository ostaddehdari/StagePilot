import {
    BadRequestException,
    Body,
    Controller,
    Get,
    Headers,
    NotFoundException,
    Param,
    Patch,
    Post,
    UnauthorizedException
} from '@nestjs/common';


import {
    dashboardSummary,
    databaseHealth
} from './db';


import {
    CreateProjectInput,
    createProject,
    getProject,
    listProjects
} from './projects';


import {
    getProjectWorkspace
} from './project-workspace';


import {
    CreateChatAccountInput,
    createChatAccount,
    getChatAccount,
    listChatAccounts
} from './chat-accounts';


import {
    ActivateConversationInput,
    CreateConversationInput,
    SelectChatAccountInput,
    activateProjectConversation,
    createProjectConversation,
    getProjectChatRegistry,
    selectProjectChatAccount
} from './project-chat-registry';


import {
    getArchiveSummary,
    getPromptArchive,
    getRunArchive
} from './archive';


import {
    completeAccountBrowserLogin,
    getAccountBrowserLogin,
    getAccountBrowserRuntime,
    startAccountBrowserLogin,
    stopAccountBrowserLogin,
    stopAccountHeadlessRuntime
} from './browser-login';


@Controller()
export class AppController {


    private authorizeInternal(
        key?: string
    ) {

        const expected =
            process.env
                .STAGEPILOT_INTERNAL_KEY;


        if (
            !expected
            ||
            !key
            ||
            key !== expected
        ) {

            throw new UnauthorizedException(
                'Invalid internal key'
            );

        }

    }


    @Get('health')
    health() {

        return {

            ok: true,

            service:
                'stagepilot-api',

            stage:
                'S02',

            work:
                'W05'

        };

    }


    @Get('health/db')
    async database() {

        const db =
            await databaseHealth();


        return {

            ok:
                true,

            service:
                'stagepilot-api',

            database: {

                name:
                    db.database_name,

                user:
                    db.database_user,

                migration:
                    db.migration,

                eventCount:
                    Number(
                        db.event_count
                    )

            }

        };

    }


    @Get('dashboard/summary')
    async dashboard() {

        const summary =
            await dashboardSummary();


        return {

            ok:
                true,

            service:
                'stagepilot-api',

            generatedAt:
                new Date()
                    .toISOString(),

            ...summary

        };

    }


    @Get('chat-accounts/:id/browser-login')
    async browserLoginStatus(
        @Param('id')
        id: string,

        @Headers(
            'x-stagepilot-internal-key'
        )
        internalKey?: string
    ) {

        this.authorizeInternal(
            internalKey
        );


        try {

            return {

                ok:
                    true,

                browserLogin:
                    await getAccountBrowserLogin(
                        id
                    )

            };

        } catch (error) {

            const message =
                error
                instanceof Error
                ? error.message
                : 'BROWSER_LOGIN_STATUS_FAILED';


            throw new BadRequestException(
                message
            );

        }

    }


    @Post('chat-accounts/:id/browser-login/start')
    async startBrowserLogin(
        @Param('id')
        id: string,

        @Body()
        body: {
            targetUrl?: unknown;
        },

        @Headers(
            'x-stagepilot-internal-key'
        )
        internalKey?: string
    ) {

        this.authorizeInternal(
            internalKey
        );


        try {

            return {

                ok:
                    true,

                browserLogin:
                    await startAccountBrowserLogin(
                        id,
                        body?.targetUrl
                    )

            };

        } catch (error) {

            const message =
                error
                instanceof Error
                ? error.message
                : 'BROWSER_LOGIN_START_FAILED';


            throw new BadRequestException(
                message
            );

        }

    }


    @Post('chat-accounts/:id/browser-login/stop')
    async stopBrowserLogin(
        @Param('id')
        id: string,

        @Headers(
            'x-stagepilot-internal-key'
        )
        internalKey?: string
    ) {

        this.authorizeInternal(
            internalKey
        );


        try {

            return {

                ok:
                    true,

                browserLogin:
                    await stopAccountBrowserLogin(
                        id
                    )

            };

        } catch (error) {

            const message =
                error
                instanceof Error
                ? error.message
                : 'BROWSER_LOGIN_STOP_FAILED';


            throw new BadRequestException(
                message
            );

        }

    }


    @Get('chat-accounts/:id/browser-runtime')
    async browserRuntimeStatus(
        @Param('id')
        id: string,

        @Headers(
            'x-stagepilot-internal-key'
        )
        internalKey?: string
    ) {

        this.authorizeInternal(
            internalKey
        );


        try {

            return {

                ok:
                    true,

                browserRuntime:
                    await getAccountBrowserRuntime(
                        id
                    )

            };

        } catch (error) {

            const message =
                error instanceof Error
                ? error.message
                : 'BROWSER_RUNTIME_STATUS_FAILED';


            throw new BadRequestException(
                message
            );

        }

    }


    @Post('chat-accounts/:id/browser-login/complete')
    async completeBrowserLogin(
        @Param('id')
        id: string,

        @Headers(
            'x-stagepilot-internal-key'
        )
        internalKey?: string
    ) {

        this.authorizeInternal(
            internalKey
        );


        try {

            return {

                ok:
                    true,

                browserRuntime:
                    await completeAccountBrowserLogin(
                        id
                    )

            };

        } catch (error) {

            const message =
                error instanceof Error
                ? error.message
                : 'BROWSER_LOGIN_COMPLETE_FAILED';


            throw new BadRequestException(
                message
            );

        }

    }


    @Post('chat-accounts/:id/headless/stop')
    async stopHeadlessRuntime(
        @Param('id')
        id: string,

        @Headers(
            'x-stagepilot-internal-key'
        )
        internalKey?: string
    ) {

        this.authorizeInternal(
            internalKey
        );


        try {

            return {

                ok:
                    true,

                browserRuntime:
                    await stopAccountHeadlessRuntime(
                        id
                    )

            };

        } catch (error) {

            const message =
                error instanceof Error
                ? error.message
                : 'HEADLESS_STOP_FAILED';


            throw new BadRequestException(
                message
            );

        }

    }


    @Get('archive/summary')
    async archiveSummary(
        @Headers(
            'x-stagepilot-internal-key'
        )
        internalKey?: string
    ) {

        this.authorizeInternal(
            internalKey
        );


        return {

            ok:
                true,

            archive:
                await getArchiveSummary()

        };

    }


    @Get('archive/prompts/:id')
    async archivePrompt(
        @Param('id')
        id: string,

        @Headers(
            'x-stagepilot-internal-key'
        )
        internalKey?: string
    ) {

        this.authorizeInternal(
            internalKey
        );


        const archive =
            await getPromptArchive(
                id
            );


        if (!archive) {

            throw new NotFoundException(
                'Prompt archive not found'
            );

        }


        return {

            ok:
                true,

            archive

        };

    }


    @Get('archive/runs/:id')
    async archiveRun(
        @Param('id')
        id: string,

        @Headers(
            'x-stagepilot-internal-key'
        )
        internalKey?: string
    ) {

        this.authorizeInternal(
            internalKey
        );


        const archive =
            await getRunArchive(
                id
            );


        if (!archive) {

            throw new NotFoundException(
                'Run archive not found'
            );

        }


        return {

            ok:
                true,

            archive

        };

    }



    @Get('chat-accounts')
    async chatAccounts(
        @Headers(
            'x-stagepilot-internal-key'
        )
        internalKey?: string
    ) {

        this.authorizeInternal(
            internalKey
        );


        return {

            ok:
                true,

            accounts:
                await listChatAccounts()

        };

    }


    @Get('chat-accounts/:id')
    async chatAccount(
        @Param('id')
        id: string,

        @Headers(
            'x-stagepilot-internal-key'
        )
        internalKey?: string
    ) {

        this.authorizeInternal(
            internalKey
        );


        const result =
            await getChatAccount(
                id
            );


        if (!result) {

            throw new NotFoundException(
                'Chat account not found'
            );

        }


        return {

            ok:
                true,

            ...result

        };

    }


    @Post('chat-accounts')
    async createChatAccount(
        @Body()
        body: CreateChatAccountInput,

        @Headers(
            'x-stagepilot-internal-key'
        )
        internalKey?: string
    ) {

        this.authorizeInternal(
            internalKey
        );


        try {

            return {

                ok:
                    true,

                account:
                    await createChatAccount(
                        body
                    )

            };

        } catch (error) {

            const message =
                error
                instanceof Error
                ? error.message
                : 'CHAT_ACCOUNT_CREATE_FAILED';


            throw new BadRequestException(
                message
            );

        }

    }


    @Get('projects')
    async projects(
        @Headers(
            'x-stagepilot-internal-key'
        )
        internalKey?: string
    ) {

        this.authorizeInternal(
            internalKey
        );


        return {

            ok:
                true,

            projects:
                await listProjects()

        };

    }


    @Post('projects')
    async create(
        @Body()
        body: CreateProjectInput,

        @Headers(
            'x-stagepilot-internal-key'
        )
        internalKey?: string
    ) {

        this.authorizeInternal(
            internalKey
        );


        try {

            return {

                ok:
                    true,

                project:
                    await createProject(
                        body
                    )

            };

        } catch (error) {

            const message =
                error
                instanceof Error
                ? error.message
                : 'PROJECT_CREATE_FAILED';


            throw new BadRequestException(
                message
            );

        }

    }


    @Get('projects/:id/chat-registry')
    async projectChatRegistry(
        @Param('id')
        id: string,

        @Headers(
            'x-stagepilot-internal-key'
        )
        internalKey?: string
    ) {

        this.authorizeInternal(
            internalKey
        );


        const result =
            await getProjectChatRegistry(
                id
            );


        if (!result) {

            throw new NotFoundException(
                'Project not found'
            );

        }


        return {

            ok:
                true,

            registry:
                result

        };

    }


    @Patch('projects/:id/chat-account')
    async selectChatAccount(
        @Param('id')
        id: string,

        @Body()
        body: SelectChatAccountInput,

        @Headers(
            'x-stagepilot-internal-key'
        )
        internalKey?: string
    ) {

        this.authorizeInternal(
            internalKey
        );


        try {

            return {

                ok:
                    true,

                account:
                    await selectProjectChatAccount(
                        id,
                        body
                    )

            };

        } catch (error) {

            const message =
                error
                instanceof Error
                ? error.message
                : 'CHAT_ACCOUNT_SELECTION_FAILED';


            throw new BadRequestException(
                message
            );

        }

    }


    @Post('projects/:id/conversations')
    async createConversation(
        @Param('id')
        id: string,

        @Body()
        body: CreateConversationInput,

        @Headers(
            'x-stagepilot-internal-key'
        )
        internalKey?: string
    ) {

        this.authorizeInternal(
            internalKey
        );


        try {

            return {

                ok:
                    true,

                conversation:
                    await createProjectConversation(
                        id,
                        body
                    )

            };

        } catch (error) {

            const message =
                error
                instanceof Error
                ? error.message
                : 'CONVERSATION_CREATE_FAILED';


            throw new BadRequestException(
                message
            );

        }

    }


    @Patch('projects/:id/conversations/:conversationId/activate')
    async activateConversation(
        @Param('id')
        id: string,

        @Param('conversationId')
        conversationId: string,

        @Body()
        body: ActivateConversationInput,

        @Headers(
            'x-stagepilot-internal-key'
        )
        internalKey?: string
    ) {

        this.authorizeInternal(
            internalKey
        );


        try {

            return {

                ok:
                    true,

                conversation:
                    await activateProjectConversation(
                        id,
                        conversationId,
                        body
                    )

            };

        } catch (error) {

            const message =
                error
                instanceof Error
                ? error.message
                : 'CONVERSATION_ACTIVATION_FAILED';


            throw new BadRequestException(
                message
            );

        }

    }


    @Get('projects/:id/workspace')
    async projectWorkspace(
        @Param('id')
        id: string,

        @Headers(
            'x-stagepilot-internal-key'
        )
        internalKey?: string
    ) {

        this.authorizeInternal(
            internalKey
        );


        const workspace =
            await getProjectWorkspace(
                id
            );


        if (!workspace) {

            throw new NotFoundException(
                'Project not found'
            );

        }


        return {

            ok:
                true,

            workspace

        };

    }


    @Get('projects/:id')
    async project(
        @Param('id')
        id: string,

        @Headers(
            'x-stagepilot-internal-key'
        )
        internalKey?: string
    ) {

        this.authorizeInternal(
            internalKey
        );


        const result =
            await getProject(
                id
            );


        if (!result) {

            throw new NotFoundException(
                'Project not found'
            );

        }


        return {

            ok:
                true,

            ...result

        };

    }

}

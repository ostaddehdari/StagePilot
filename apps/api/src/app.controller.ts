import {
    BadRequestException,
    Body,
    Controller,
    Delete,
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
    deleteProject,
    getProject,
    listProjects,
    UpdateProjectInput,
    updateProject
} from './projects';


import {
    getProjectWorkspace
} from './project-workspace';


import {
    CreateChatAccountInput,
    createChatAccount,
    deleteChatAccount,
    getChatAccount,
    listChatAccounts,
    UpdateChatAccountInput,
    updateChatAccount
} from './chat-accounts';


import {
    addPlanningMessage,
    approveProjectPlan,
    getPlanningWorkspace,
    requestPlanningEvaluation,
    saveProjectPlan
} from './planning';


import {
    getSiteSettings,
    updateSiteSettings
} from './site-settings';


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

import {
    controlProjectAutomation,
    getProjectAutomation
} from './automation';

import {
    createProjectTreeNode,
    deleteProjectTreeNode,
    getProjectNodeInspector,
    reorderProjectTree,
    saveProposalHtml,
    updateProjectIntegrationSettings,
    updateProjectTreeNode
} from './project-control';


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
                'S07',

            work:
                'W02',

            completionPackage:
                'stage72'

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


    @Patch('chat-accounts/:id')
    async updateChatAccountRecord(
        @Param('id') id: string,
        @Body() body: UpdateChatAccountInput,
        @Headers('x-stagepilot-internal-key') internalKey?: string
    ) {
        this.authorizeInternal(internalKey);
        try {
            return {
                ok: true,
                account: await updateChatAccount(id, body ?? {})
            };
        } catch (error) {
            throw new BadRequestException(
                error instanceof Error ? error.message : 'CHAT_ACCOUNT_UPDATE_FAILED'
            );
        }
    }


    @Delete('chat-accounts/:id')
    async deleteChatAccountRecord(
        @Param('id') id: string,
        @Headers('x-stagepilot-internal-key') internalKey?: string
    ) {
        this.authorizeInternal(internalKey);
        try {
            return {
                ok: true,
                account: await deleteChatAccount(id)
            };
        } catch (error) {
            throw new BadRequestException(
                error instanceof Error ? error.message : 'CHAT_ACCOUNT_DELETE_FAILED'
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


    @Patch('projects/:id')
    async updateProjectRecord(
        @Param('id') id: string,
        @Body() body: UpdateProjectInput,
        @Headers('x-stagepilot-internal-key') internalKey?: string
    ) {
        this.authorizeInternal(internalKey);
        try {
            return {
                ok: true,
                project: await updateProject(id, body ?? {})
            };
        } catch (error) {
            throw new BadRequestException(
                error instanceof Error ? error.message : 'PROJECT_UPDATE_FAILED'
            );
        }
    }


    @Delete('projects/:id')
    async deleteProjectRecord(
        @Param('id') id: string,
        @Headers('x-stagepilot-internal-key') internalKey?: string
    ) {
        this.authorizeInternal(internalKey);
        try {
            return {
                ok: true,
                project: await deleteProject(id)
            };
        } catch (error) {
            throw new BadRequestException(
                error instanceof Error ? error.message : 'PROJECT_DELETE_FAILED'
            );
        }
    }


    @Patch('projects/:id/integrations')
    async updateProjectIntegrations(
        @Param('id') id: string,
        @Body() body: Record<string, unknown>,
        @Headers('x-stagepilot-internal-key') internalKey?: string
    ) {
        this.authorizeInternal(internalKey);
        try {
            return {
                ok: true,
                project: await updateProjectIntegrationSettings(id, body ?? {})
            };
        } catch (error) {
            throw new BadRequestException(
                error instanceof Error ? error.message : 'PROJECT_INTEGRATIONS_UPDATE_FAILED'
            );
        }
    }


    @Post('projects/:id/tree/nodes')
    async createTreeNode(
        @Param('id') id: string,
        @Body() body: Record<string, unknown>,
        @Headers('x-stagepilot-internal-key') internalKey?: string
    ) {
        this.authorizeInternal(internalKey);
        try {
            return { ok: true, node: await createProjectTreeNode(id, body ?? {}) };
        } catch (error) {
            throw new BadRequestException(error instanceof Error ? error.message : 'TREE_NODE_CREATE_FAILED');
        }
    }


    @Patch('projects/:id/tree/nodes/:nodeId')
    async updateTreeNode(
        @Param('id') id: string,
        @Param('nodeId') nodeId: string,
        @Body() body: Record<string, unknown>,
        @Headers('x-stagepilot-internal-key') internalKey?: string
    ) {
        this.authorizeInternal(internalKey);
        try {
            return { ok: true, node: await updateProjectTreeNode(id, nodeId, body ?? {}) };
        } catch (error) {
            throw new BadRequestException(error instanceof Error ? error.message : 'TREE_NODE_UPDATE_FAILED');
        }
    }


    @Delete('projects/:id/tree/nodes/:nodeId')
    async deleteTreeNode(
        @Param('id') id: string,
        @Param('nodeId') nodeId: string,
        @Body() body: { kind?: unknown },
        @Headers('x-stagepilot-internal-key') internalKey?: string
    ) {
        this.authorizeInternal(internalKey);
        try {
            return { ok: true, result: await deleteProjectTreeNode(id, nodeId, body?.kind) };
        } catch (error) {
            throw new BadRequestException(error instanceof Error ? error.message : 'TREE_NODE_DELETE_FAILED');
        }
    }


    @Post('projects/:id/tree/reorder')
    async reorderTree(
        @Param('id') id: string,
        @Body() body: Record<string, unknown>,
        @Headers('x-stagepilot-internal-key') internalKey?: string
    ) {
        this.authorizeInternal(internalKey);
        try {
            return { ok: true, result: await reorderProjectTree(id, body ?? {}) };
        } catch (error) {
            throw new BadRequestException(error instanceof Error ? error.message : 'TREE_REORDER_FAILED');
        }
    }


    @Get('projects/:id/tree/:kind/:nodeId/inspector')
    async nodeInspector(
        @Param('id') id: string,
        @Param('kind') kind: string,
        @Param('nodeId') nodeId: string,
        @Headers('x-stagepilot-internal-key') internalKey?: string
    ) {
        this.authorizeInternal(internalKey);
        try {
            return { ok: true, inspector: await getProjectNodeInspector(id, kind, nodeId) };
        } catch (error) {
            throw new BadRequestException(error instanceof Error ? error.message : 'NODE_INSPECTOR_FAILED');
        }
    }


    @Patch('projects/:id/planning/plans/:version/html')
    async updateProposalHtml(
        @Param('id') id: string,
        @Param('version') version: string,
        @Body() body: { html?: unknown },
        @Headers('x-stagepilot-internal-key') internalKey?: string
    ) {
        this.authorizeInternal(internalKey);
        try {
            return { ok: true, plan: await saveProposalHtml(id, version, body?.html) };
        } catch (error) {
            throw new BadRequestException(error instanceof Error ? error.message : 'PROPOSAL_HTML_UPDATE_FAILED');
        }
    }


    @Get('projects/:id/planning')
    async planningWorkspace(
        @Param('id') id: string,
        @Headers('x-stagepilot-internal-key') internalKey?: string
    ) {
        this.authorizeInternal(internalKey);
        const planning = await getPlanningWorkspace(id);
        if (!planning) {
            throw new NotFoundException('Project not found');
        }
        return { ok: true, planning };
    }


    @Post('projects/:id/planning/messages')
    async planningMessage(
        @Param('id') id: string,
        @Body() body: {
            role?: unknown;
            messageType?: unknown;
            content?: unknown;
        },
        @Headers('x-stagepilot-internal-key') internalKey?: string
    ) {
        this.authorizeInternal(internalKey);
        try {
            return {
                ok: true,
                message: await addPlanningMessage(id, body ?? {})
            };
        } catch (error) {
            throw new BadRequestException(
                error instanceof Error ? error.message : 'PLANNING_MESSAGE_FAILED'
            );
        }
    }


    @Post('projects/:id/planning/evaluate')
    async evaluateProject(
        @Param('id') id: string,
        @Headers('x-stagepilot-internal-key') internalKey?: string
    ) {
        this.authorizeInternal(internalKey);
        try {
            return {
                ok: true,
                promptRequest: await requestPlanningEvaluation(id)
            };
        } catch (error) {
            throw new BadRequestException(
                error instanceof Error ? error.message : 'PLANNING_EVALUATION_FAILED'
            );
        }
    }


    @Post('projects/:id/planning/plans')
    async savePlan(
        @Param('id') id: string,
        @Body() body: {
            plan?: unknown;
            rawJson?: unknown;
            createdBy?: unknown;
            summary?: unknown;
        },
        @Headers('x-stagepilot-internal-key') internalKey?: string
    ) {
        this.authorizeInternal(internalKey);
        try {
            return {
                ok: true,
                plan: await saveProjectPlan(id, body ?? {})
            };
        } catch (error) {
            throw new BadRequestException(
                error instanceof Error ? error.message : 'PROJECT_PLAN_SAVE_FAILED'
            );
        }
    }


    @Post('projects/:id/planning/plans/:version/approve')
    async approvePlan(
        @Param('id') id: string,
        @Param('version') version: string,
        @Body() body: { repositoryName?: unknown },
        @Headers('x-stagepilot-internal-key') internalKey?: string
    ) {
        this.authorizeInternal(internalKey);
        try {
            return {
                ok: true,
                result: await approveProjectPlan(
                    id,
                    Number(version),
                    body?.repositoryName
                )
            };
        } catch (error) {
            throw new BadRequestException(
                error instanceof Error ? error.message : 'PROJECT_PLAN_APPROVAL_FAILED'
            );
        }
    }


    @Get('projects/:id/automation')
    async projectAutomation(
        @Param('id') id: string,
        @Headers('x-stagepilot-internal-key') internalKey?: string
    ) {
        this.authorizeInternal(internalKey);
        return {
            ok: true,
            automation: await getProjectAutomation(id)
        };
    }


    @Post('projects/:id/automation/control')
    async controlAutomation(
        @Param('id') id: string,
        @Body() body: { action?: unknown },
        @Headers('x-stagepilot-internal-key') internalKey?: string
    ) {
        this.authorizeInternal(internalKey);
        try {
            return {
                ok: true,
                state: await controlProjectAutomation(id, body?.action)
            };
        } catch (error) {
            throw new BadRequestException(
                error instanceof Error ? error.message : 'AUTOMATION_CONTROL_FAILED'
            );
        }
    }


    @Get('settings')
    async settings(
        @Headers('x-stagepilot-internal-key') internalKey?: string
    ) {
        this.authorizeInternal(internalKey);
        return {
            ok: true,
            settings: await getSiteSettings()
        };
    }


    @Patch('settings')
    async saveSettings(
        @Body() body: {
            githubOwner?: unknown;
            githubUsername?: unknown;
            githubToken?: unknown;
            githubPassword?: unknown;
            defaultRepository?: unknown;
            defaultVisibility?: unknown;
        },
        @Headers('x-stagepilot-internal-key') internalKey?: string
    ) {
        this.authorizeInternal(internalKey);
        try {
            return {
                ok: true,
                settings: await updateSiteSettings(body ?? {})
            };
        } catch (error) {
            throw new BadRequestException(
                error instanceof Error ? error.message : 'SETTINGS_UPDATE_FAILED'
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

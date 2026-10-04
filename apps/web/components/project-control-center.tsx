'use client';

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';

import type Quill from 'quill';

import type { loadProjectControlCenter } from '../lib/project-control';


type ControlData = NonNullable<Awaited<ReturnType<typeof loadProjectControlCenter>>>;
type TreeNodeEditor = null | {
    mode: 'create' | 'edit';
    kind: 'stage' | 'work';
    nodeId?: string;
    parentId?: string;
    position?: number;
    title?: string;
    description?: string | null;
};
type InspectorTab = {
    id: string;
    title: string;
    data: {
        node: Record<string, unknown>;
        prompts: Array<Record<string, unknown>>;
        runs: Array<Record<string, unknown>>;
        attempts: Array<Record<string, unknown>>;
    };
};


const TAB_NAMES: Record<string, string> = {
    settings: 'اتصال‌ها',
    workspace: 'اتاق فرمان',
    proposal: 'پروپوزال',
    overview: 'وضعیت اجرا',
    logs: 'گزارش رویدادها'
};

const TRANSPORT_LABELS: Record<string, string> = {
    worker_claimed: 'Worker دریافت کرد',
    context_loading: 'بررسی حساب و لینک',
    context_ready: 'حساب و مقصد آماده',
    browser_starting: 'راه‌اندازی مرورگر',
    browser_ready: 'مرورگر آماده',
    target_opening: 'بازکردن لینک ChatGPT',
    target_opened: 'لینک باز شد',
    project_creating: 'ساخت پروژه ChatGPT',
    project_created: 'پروژه ChatGPT ساخته شد',
    new_chat_opening: 'بازکردن چت جدید',
    new_chat_opened: 'چت جدید باز شد',
    composer_drafting: 'درج متن درخواست',
    composer_ready: 'متن وارد شد',
    send_clicking: 'کلیک دکمه ارسال',
    send_confirmed: 'ارسال تأیید شد',
    send_uncertain_recovery: 'بررسی ارسال بدون تکرار پیام',
    response_waiting: 'انتظار پاسخ ChatGPT',
    response_recovery: 'بازیابی پاسخ بدون ارسال مجدد',
    response_received: 'پاسخ دریافت شد',
    completed: 'نتیجه ثبت و نمایش شد',
    failed: 'چرخه با خطا متوقف شد'
};


function faNumber(value: number) {
    return new Intl.NumberFormat('fa-IR', { maximumFractionDigits: 1 }).format(value);
}


function faDate(value: unknown) {
    if (typeof value !== 'string' || !value) return '—';
    try {
        return new Intl.DateTimeFormat('fa-IR', {
            dateStyle: 'medium',
            timeStyle: 'short'
        }).format(new Date(value));
    } catch {
        return value;
    }
}


function safeText(value: unknown) {
    return typeof value === 'string' ? value : value == null ? '' : JSON.stringify(value, null, 2);
}


function escapeHtml(value: unknown) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;');
}


function planHtml(plan: Record<string, unknown>) {
    const stages = Array.isArray(plan.stages) ? plan.stages : [];
    const technologies = Array.isArray(plan.technologies) ? plan.technologies : [];
    return `<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><style>body{font-family:Tahoma,sans-serif;line-height:1.9;color:#172033;padding:28px}h1,h2{color:#243b7a}section{border:1px solid #e5e9f2;border-radius:14px;padding:16px;margin:12px 0}li{margin:6px 0}</style></head><body>
<h1>${escapeHtml(plan.projectName ?? 'پروپوزال پروژه')}</h1><p>${escapeHtml(plan.summary ?? '')}</p>
<h2>فناوری‌ها</h2><ul>${technologies.map(raw => { const item = raw as Record<string, unknown>; return `<li><strong>${escapeHtml(item.area)}</strong>: ${escapeHtml(item.choice)} — ${escapeHtml(item.reason)}</li>`; }).join('')}</ul>
<h2>Stage و Work</h2>${stages.map(raw => { const stage = raw as Record<string, unknown>; const works = Array.isArray(stage.works) ? stage.works : []; return `<section><h3>${escapeHtml(stage.id)} · ${escapeHtml(stage.title)}</h3><p>${escapeHtml(stage.objective)}</p><ol>${works.map(workRaw => { const work = workRaw as Record<string, unknown>; return `<li><strong>${escapeHtml(work.id)} · ${escapeHtml(work.title)}</strong><br>${escapeHtml(work.objective)}</li>`; }).join('')}</ol></section>`; }).join('')}
</body></html>`;
}


function errorLabel(error: string) {
    if (error.startsWith('CHATGPT_SEND_NOT_CONFIRMED:SEND_UNCERTAIN')) {
        return 'وضعیت ارسال قطعی نیست؛ برای جلوگیری از پیام تکراری، ارسال خودکار متوقف شد. چت ChatGPT را از مانیتور بررسی کنید.';
    }
    const labels: Record<string, string> = {
        EXECUTED_NODE_CANNOT_BE_DELETED: 'این مرحله اجرا شده و برای حفظ سوابق قابل حذف نیست.',
        PROJECT_CHAT_ACCOUNT_REQUIRED: 'ابتدا یک حساب ChatGPT برای پروژه انتخاب کنید.',
        EXISTING_CHAT_URL_REQUIRED: 'نشانی چت یا پروژهٔ ChatGPT را وارد کنید.',
        EXPECTED_FINE_GRAINED_PAT: 'توکن باید Fine-grained GitHub PAT باشد.',
        INVALID_CHAT_PROJECT_URL: 'نشانی ChatGPT معتبر نیست.',
        'CHATGPT_INTERVENTION_REQUIRED:challenge': 'Cloudflare مانع دسترسی شده است؛ در تنظیمات پروژه noVNC را باز کنید و بررسی انسانی را کامل کنید.',
        'CHATGPT_INTERVENTION_REQUIRED:needs_login': 'حساب ChatGPT نیاز به ورود دارد؛ در تنظیمات پروژه noVNC را باز کنید و وارد حساب شوید.',
        DRAFT_TRIGGERED_UNEXPECTED_SEND: 'هنگام درج متن یک ارسال ناخواسته تشخیص داده شد؛ چرخه فوراً متوقف شد و تکرار خودکار انجام نمی‌شود.',
        INCOMPLETE_NODE_ORDER: 'فهرست جابه‌جایی کامل نیست؛ صفحه تازه‌سازی شد.'
    };
    return labels[error] ?? error.replaceAll('_', ' ');
}


export function ProjectControlCenter({
    initial,
    initialTab
}: {
    initial: ControlData;
    initialTab: string;
}) {
    const [data, setData] = useState(initial);
    const [tab, setTab] = useState(TAB_NAMES[initialTab] ? initialTab : 'workspace');
    const [busy, setBusy] = useState('');
    const [notice, setNotice] = useState<{ kind: 'success' | 'danger'; text: string } | null>(null);
    const [treeEditor, setTreeEditor] = useState<TreeNodeEditor>(null);
    const [dragging, setDragging] = useState<{ kind: 'stage' | 'work'; id: string; parentId?: string } | null>(null);
    const [inspectors, setInspectors] = useState<InspectorTab[]>([]);
    const [activeInspector, setActiveInspector] = useState('chat');
    const latestPlan = data.planning.plans[0] ?? null;
    const officialProposal = data.planning.officialProposal;
    const latestRequest = data.planning.promptRequests[0] ?? null;
    const transportHistory = Array.isArray(latestRequest?.context_json?.transportHistory)
        ? latestRequest.context_json.transportHistory as Array<Record<string, unknown>>
        : [];
    const requestActive = latestRequest
        ? ['created', 'retry', 'processing', 'sent', 'waiting_response'].includes(latestRequest.status)
        : false;
    const defaultHtml = useMemo(
        () => officialProposal?.proposalHtml ?? '',
        [officialProposal]
    );
    const [proposalSource, setProposalSource] = useState(defaultHtml);
    const [proposalEditorMode, setProposalEditorMode] = useState<'visual' | 'html' | 'preview'>('visual');
    const quillHostRef = useRef<HTMLDivElement>(null);
    const quillInstanceRef = useRef<Quill | null>(null);

    const endpoint = `/StagePilot/api/projects/${data.project.id}/control`;

    async function refresh(silent = false) {
        if (!silent) setBusy('refresh');
        try {
            const response = await fetch(endpoint, { cache: 'no-store' });
            const body = await response.json();
            if (!response.ok) throw new Error(body.error ?? 'REFRESH_FAILED');
            setData(body.control);
        } catch (error) {
            if (!silent) setNotice({ kind: 'danger', text: errorLabel(error instanceof Error ? error.message : 'REFRESH_FAILED') });
        } finally {
            if (!silent) setBusy('');
        }
    }

    async function command(action: string, payload: Record<string, unknown> = {}, success = 'عملیات با موفقیت ثبت شد.') {
        setBusy(action);
        setNotice(null);
        try {
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ action, ...payload })
            });
            const body = await response.json();
            if (!response.ok) throw new Error(body.error ?? 'ACTION_FAILED');
            setNotice({ kind: 'success', text: success });
            await refresh(true);
            return body.result;
        } catch (error) {
            setNotice({ kind: 'danger', text: errorLabel(error instanceof Error ? error.message : 'ACTION_FAILED') });
            return null;
        } finally {
            setBusy('');
        }
    }

    useEffect(() => {
        const timer = window.setInterval(() => {
            if (!busy && !treeEditor) void refresh(true);
        }, requestActive ? 3000 : 15000);
        return () => window.clearInterval(timer);
    }, [busy, treeEditor, requestActive]);

    useEffect(() => {
        setProposalSource(defaultHtml);
    }, [defaultHtml]);

    useEffect(() => {
        let cancelled = false;
        let editor: Quill | null = null;
        const start = async () => {
            if (!quillHostRef.current || quillInstanceRef.current) return;
            const QuillEditor = (await import('quill')).default;
            if (cancelled || !quillHostRef.current) return;
            editor = new QuillEditor(quillHostRef.current, {
                theme: 'snow',
                placeholder: 'متن پروپوزال رسمی را اینجا ویرایش کنید…',
                modules: {
                    toolbar: [
                        [{ header: [1, 2, 3, false] }],
                        ['bold', 'italic', 'underline', 'strike'],
                        [{ color: [] }, { background: [] }],
                        [{ list: 'ordered' }, { list: 'bullet' }],
                        [{ align: [] }, { direction: 'rtl' }],
                        ['blockquote', 'code-block', 'link'],
                        ['clean']
                    ]
                }
            });
            quillInstanceRef.current = editor;
            editor.root.innerHTML = proposalSource || '<p><br></p>';
            editor.on('text-change', () => setProposalSource(editor?.root.innerHTML ?? ''));
        };
        void start();
        return () => {
            cancelled = true;
            if (editor) editor.off('text-change');
        };
    }, []);

    useEffect(() => {
        const editor = quillInstanceRef.current;
        if (!editor || proposalEditorMode !== 'visual') return;
        if (editor.root.contains(document.activeElement)) return;
        if (editor.root.innerHTML !== proposalSource) editor.root.innerHTML = proposalSource || '<p><br></p>';
    }, [proposalEditorMode, proposalSource]);

    function selectTab(next: string) {
        setTab(next);
        const url = new URL(window.location.href);
        url.searchParams.set('tab', next);
        window.history.replaceState({}, '', url);
    }

    async function saveSettings(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const submitter = (event.nativeEvent as SubmitEvent).submitter;
        const intent = submitter instanceof HTMLButtonElement ? submitter.value : '';
        const form = new FormData(event.currentTarget);
        const saved = await command('save-settings', {
            chatAccountId: String(form.get('chatAccountId') ?? ''),
            payload: {
                githubMode: String(form.get('githubMode') ?? 'global'),
                githubOwner: String(form.get('githubOwner') ?? ''),
                githubUsername: String(form.get('githubUsername') ?? ''),
                githubToken: String(form.get('githubToken') ?? ''),
                repositoryName: String(form.get('repositoryName') ?? ''),
                repositoryVisibility: String(form.get('repositoryVisibility') ?? 'private'),
                chatTargetType: String(form.get('chatTargetType') ?? 'conversation'),
                chatProjectUrl: String(form.get('chatProjectUrl') ?? '')
            }
        }, 'تنظیمات اتصال پروژه ذخیره شد.');
        if (saved && intent === 'evaluate') {
            await command('planning-evaluate', {}, 'تنظیمات ذخیره و ساخت پروپوزال حرفه‌ای در صف ChatGPT قرار گرفت.');
        }
    }

    async function startBrowserMonitor(formElement: HTMLFormElement | null) {
        if (!formElement) return;
        const form = new FormData(formElement);
        const accountId = String(form.get('chatAccountId') ?? '');
        const targetUrl = String(form.get('chatProjectUrl') ?? '');
        const popup = window.open('about:blank', 'stagepilot-chatgpt-monitor');
        const result = await command(
            'browser-monitor-start',
            { accountId, targetUrl },
            'مانیتور زنده ChatGPT فعال شد.'
        ) as { viewerUrl?: string } | null;
        if (result?.viewerUrl) {
            if (popup) popup.location.href = result.viewerUrl;
            else window.location.href = result.viewerUrl;
        } else {
            popup?.close();
        }
    }

    async function stopBrowserMonitor() {
        const accountId = data.browserMonitor.accountId;
        if (!accountId) return;
        await command(
            'browser-monitor-stop',
            { accountId },
            'ورود بررسی شد؛ مانیتور بسته و چرخه جدید ChatGPT در صف قرار گرفت.'
        );
    }

    async function submitTreeEditor(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (!treeEditor) return;
        const form = new FormData(event.currentTarget);
        const payload = {
            kind: treeEditor.kind,
            parentId: treeEditor.parentId,
            position: treeEditor.position,
            key: String(form.get('key') ?? ''),
            title: String(form.get('title') ?? ''),
            description: String(form.get('description') ?? '')
        };
        const result = treeEditor.mode === 'create'
            ? await command('tree-create', { payload }, 'نود جدید به برنامه اضافه شد.')
            : await command('tree-update', { nodeId: treeEditor.nodeId, payload }, 'تغییرات نود ذخیره شد.');
        if (result) setTreeEditor(null);
    }

    async function inspectNode(kind: 'stage' | 'work', id: string, title: string) {
        const existing = inspectors.find(item => item.id === id);
        if (existing) {
            setActiveInspector(id);
            return;
        }
        const result = await command('inspect-node', { kind, nodeId: id }, 'جزئیات دستور و اجرا بارگذاری شد.');
        const inspector = result?.inspector;
        if (!inspector) return;
        setInspectors(current => [...current, { id, title, data: inspector }]);
        setActiveInspector(id);
    }

    async function dropStage(targetId: string) {
        if (!dragging || dragging.kind !== 'stage' || dragging.id === targetId) return;
        const ids = data.workspace.stages.map(stage => stage.id);
        const from = ids.indexOf(dragging.id);
        const to = ids.indexOf(targetId);
        ids.splice(to, 0, ids.splice(from, 1)[0]);
        await command('tree-reorder', { payload: { kind: 'stage', orderedIds: ids } }, 'ترتیب Stageها ذخیره شد.');
        setDragging(null);
    }

    async function dropWork(stageId: string, targetId: string) {
        if (!dragging || dragging.kind !== 'work' || dragging.parentId !== stageId || dragging.id === targetId) return;
        const stage = data.workspace.stages.find(item => item.id === stageId);
        if (!stage) return;
        const ids = stage.works.map(work => work.id);
        const from = ids.indexOf(dragging.id);
        const to = ids.indexOf(targetId);
        ids.splice(to, 0, ids.splice(from, 1)[0]);
        await command('tree-reorder', { payload: { kind: 'work', parentId: stageId, orderedIds: ids } }, 'ترتیب Workها ذخیره شد.');
        setDragging(null);
    }

    const settings = data.project.settings ?? {};
    const githubMode = String(settings.githubMode ?? 'global');
    const completedWorks = data.workspace.totals.completedWorks;
    const totalWorks = data.workspace.totals.works;
    const automationStatus = data.automation.state?.status ?? 'idle';

    return (
        <div className="sp-control-center">
            <header className="sp-project-hero">
                <div className="sp-project-identity">
                    <Link href="/projects" className="sp-icon-link" title="بازگشت به پروژه‌ها"><i className="fa-solid fa-arrow-right" /></Link>
                    <div><span>{data.project.slug}</span><h1>{data.project.name}</h1><p>{data.project.description || 'بدون توضیح کوتاه'}</p></div>
                </div>
                <div className="sp-project-kpis">
                    <div><strong>{faNumber(data.workspace.verifiedProgress)}٪</strong><span>پیشرفت معتبر</span></div>
                    <div><strong>{faNumber(completedWorks)} / {faNumber(totalWorks)}</strong><span>Work تکمیل‌شده</span></div>
                    <div><strong className={`sp-status-dot state-${automationStatus}`}>{automationStatus}</strong><span>مدیر خودکار</span></div>
                </div>
            </header>

            <nav className="sp-control-tabs" aria-label="بخش‌های پروژه">
                {Object.entries(TAB_NAMES).map(([key, label]) => (
                    <button key={key} type="button" className={tab === key ? 'active' : ''} onClick={() => selectTab(key)}>
                        <i className={`fa-solid ${key === 'settings' ? 'fa-sliders' : key === 'workspace' ? 'fa-comments' : key === 'proposal' ? 'fa-file-signature' : key === 'overview' ? 'fa-chart-line' : 'fa-list-check'}`} />
                        {label}
                    </button>
                ))}
                <button type="button" className="sp-tab-refresh" disabled={Boolean(busy)} onClick={() => void refresh()} title="تازه‌سازی">
                    <i className={`fa-solid fa-rotate ${busy ? 'fa-spin' : ''}`} />
                </button>
            </nav>

            {notice && <div className={`alert alert-${notice.kind} sp-toast`}><i className={`fa-solid ${notice.kind === 'success' ? 'fa-circle-check' : 'fa-triangle-exclamation'}`} />{notice.text}</div>}

            {tab === 'settings' && (
                <section className="sp-tab-page">
                    <div className="sp-page-title"><div><span>PROJECT CONNECTIONS</span><h2>اتصال پروژه به هوش مصنوعی و GitHub</h2></div><p>مقادیر سراسری به‌صورت پیش‌فرض استفاده می‌شوند؛ فقط در صورت نیاز آن‌ها را برای همین پروژه تغییر دهید.</p></div>
                    <form className="sp-settings-grid" onSubmit={saveSettings}>
                        <article className="sp-card">
                            <div className="sp-card-title"><i className="fa-brands fa-github" /><div><h3>GitHub</h3><p>مخزن و هویت اختصاصی پروژه</p></div></div>
                            <label><span>روش اتصال</span><select name="githubMode" defaultValue={githubMode}><option value="global">استفاده از تنظیمات سایت</option><option value="custom">حساب اختصاصی این پروژه</option></select></label>
                            <div className="sp-default-note"><i className="fa-solid fa-wand-magic-sparkles" />پیش‌فرض: {data.siteSettings.githubOwner || 'تنظیم نشده'} · توکن {data.siteSettings.tokenConfigured ? 'آماده' : 'ثبت نشده'}</div>
                            <div className="row g-3">
                                <label className="col-md-6"><span>Owner اختصاصی</span><input name="githubOwner" dir="ltr" autoComplete="username" defaultValue={String(settings.githubOwner ?? data.siteSettings.githubOwner ?? '')} /></label>
                                <label className="col-md-6"><span>Username</span><input name="githubUsername" dir="ltr" autoComplete="username" defaultValue={String(settings.githubUsername ?? data.siteSettings.githubUsername ?? '')} /></label>
                                <label className="col-md-8"><span>نام مخزن</span><input name="repositoryName" dir="ltr" autoComplete="off" defaultValue={String(settings.repositoryName ?? data.project.slug)} required /></label>
                                <label className="col-md-4"><span>دسترسی</span><select name="repositoryVisibility" defaultValue={String(settings.repositoryVisibility ?? data.siteSettings.defaultVisibility ?? 'private')}><option value="private">Private</option><option value="public">Public</option></select></label>
                            </div>
                            <label><span>Fine-grained Token جدید (اختیاری)</span><input name="githubToken" type="password" dir="ltr" autoComplete="new-password" placeholder={settings.githubTokenConfigured ? 'توکن اختصاصی ذخیره شده؛ برای حفظ، خالی بگذارید' : 'github_pat_…'} /></label>
                        </article>

                        <article className="sp-card">
                            <div className="sp-card-title"><i className="fa-solid fa-robot" /><div><h3>ChatGPT</h3><p>حساب، چت یا فضای پروژه</p></div></div>
                            <label><span>حساب ChatGPT</span><select name="chatAccountId" defaultValue={data.registry.project.selected_chat_account_id ?? ''} required><option value="" disabled>انتخاب حساب</option>{data.accounts.map(account => <option key={account.id} value={account.id}>{account.label} · {account.status}</option>)}</select></label>
                            <label><span>نوع مقصد</span><select name="chatTargetType" defaultValue={String(settings.chatTargetType ?? 'conversation')}><option value="conversation">چت معمولی</option><option value="project">ChatGPT Project</option></select></label>
                            <label><span>نشانی پروژه یا چت موجود</span><input name="chatProjectUrl" type="url" dir="ltr" autoComplete="url" defaultValue={String(settings.chatProjectUrl ?? data.registry.activeConversation?.external_url ?? '')} placeholder="https://chatgpt.com/g/... یا https://chatgpt.com/c/..." /></label>
                            <div className="sp-inline-actions">
                                <button type="button" className="btn btn-outline-primary" disabled={Boolean(busy) || requestActive} onClick={event => { const form = new FormData(event.currentTarget.form ?? undefined); void command('new-conversation', { chatAccountId: String(form.get('chatAccountId') ?? ''), startedReason: 'new_chat_requested' }, 'ساخت چت جدید و ارسال اولین پیام در صف Worker قرار گرفت.'); }}><i className="fa-solid fa-comment-medical" /> چت جدید</button>
                                <button type="button" className="btn btn-outline-dark" disabled={Boolean(busy) || requestActive} onClick={event => { const form = new FormData(event.currentTarget.form ?? undefined); void command('new-conversation', { chatAccountId: String(form.get('chatAccountId') ?? ''), startedReason: 'new_chatgpt_project_requested' }, 'ساخت ChatGPT Project و ارسال اولین پیام در صف Worker قرار گرفت.'); }}><i className="fa-solid fa-folder-plus" /> پروژه جدید ChatGPT</button>
                            </div>
                            <div className="sp-default-note"><i className="fa-solid fa-link" />{data.registry.activeConversation?.external_url || 'هنوز لینک فعالی ثبت نشده است.'}</div>
                            <div className="sp-browser-monitor">
                                <div><i className="fa-solid fa-desktop" /><span><strong>مشاهده زنده ChatGPT</strong><small>مرورگر را با noVNC ببینید و اگر ورود یا تأییدی لازم بود همان‌جا انجام دهید.</small></span></div>
                                <div className="sp-inline-actions">
                                    <button type="button" className="btn btn-outline-primary" disabled={Boolean(busy)} onClick={event => void startBrowserMonitor(event.currentTarget.form)}><i className="fa-solid fa-eye" /> بازکردن noVNC</button>
                                    {data.browserMonitor.login?.viewerUrl && <a className="btn btn-outline-dark" target="_blank" rel="noreferrer" href={data.browserMonitor.login.viewerUrl}><i className="fa-solid fa-up-right-from-square" /> نمایش مانیتور فعال</a>}
                                    <button type="button" className="btn btn-outline-secondary" disabled={Boolean(busy) || !data.browserMonitor.accountId} onClick={() => void stopBrowserMonitor()}><i className="fa-solid fa-circle-check" /> پایان مشاهده و بازگشت خودکار</button>
                                </div>
                                <small>حالت فعلی: {data.browserMonitor.runtime?.mode ?? data.browserMonitor.login?.status ?? 'خاموش'} · ورود: {data.browserMonitor.runtime?.authState ?? 'نامشخص'}</small>
                            </div>
                        </article>
                        <div className="sp-settings-submit"><button className="btn sp-primary" type="submit" name="intent" value="save" disabled={Boolean(busy)}><i className="fa-solid fa-floppy-disk" /> ذخیره تنظیمات</button><button className="btn btn-dark" type="submit" name="intent" value="evaluate" disabled={Boolean(busy) || requestActive}><i className="fa-solid fa-paper-plane" /> ذخیره و شروع ارزیابی ایده</button></div>
                    </form>
                </section>
            )}

            {tab === 'workspace' && (
                <section className="sp-tab-page sp-workspace-layout">
                    <aside className="sp-tree-panel sp-card">
                        <div className="sp-tree-heading"><div><span>PLAN TREE</span><h3>Stage و Work</h3></div><button type="button" onClick={() => setTreeEditor({ mode: 'create', kind: 'stage', position: data.workspace.stages.length })} title="Stage جدید"><i className="fa-solid fa-plus" /></button></div>
                        <div className="sp-tree-scroll">
                            {data.workspace.stages.length === 0 && <div className="sp-empty-small"><i className="fa-solid fa-diagram-project" /><p>پس از تأیید پروپوزال، درخت ساخته می‌شود؛ یا Stage را دستی اضافه کنید.</p></div>}
                            {data.workspace.stages.map((stage, stageIndex) => {
                                const stageLocked = Boolean(stage.started_at) || !['pending', 'ready', 'draft'].includes(stage.status);
                                return <div key={stage.id} className="sp-stage-node" draggable={!stageLocked} onDragStart={() => setDragging({ kind: 'stage', id: stage.id })} onDragOver={event => event.preventDefault()} onDrop={() => void dropStage(stage.id)}>
                                    <div className="sp-node-row">
                                        <i className="fa-solid fa-grip-vertical sp-grip" />
                                        <button type="button" className="sp-node-main" onClick={() => setTreeEditor({ mode: 'edit', kind: 'stage', nodeId: stage.id, title: stage.title, description: stage.description })}><small>{stage.stage_key}</small><strong>{stage.title}</strong><span className={`state-${stage.status}`}>{stage.status}</span></button>
                                        <div className="sp-node-tools">
                                            <button type="button" title="دستورها و نتیجه" onClick={() => void inspectNode('stage', stage.id, stage.title)}><i className="fa-solid fa-eye" /></button>
                                            <button type="button" title="Work جدید" onClick={() => setTreeEditor({ mode: 'create', kind: 'work', parentId: stage.id, position: stage.works.length })}><i className="fa-solid fa-plus" /></button>
                                            <button type="button" title={stageLocked ? 'مرحله اجرا شده و قابل حذف نیست' : 'حذف Stage'} disabled={stageLocked} onClick={() => void command('tree-delete', { kind: 'stage', nodeId: stage.id }, 'Stage حذف شد.')}><i className="fa-solid fa-xmark" /></button>
                                        </div>
                                    </div>
                                    <div className="sp-work-list">
                                        {stage.works.map((work, workIndex) => {
                                            const locked = Boolean(work.started_at) || !['pending', 'ready', 'draft'].includes(work.status);
                                            return <div key={work.id} className="sp-work-node" draggable={!locked} onDragStart={event => { event.stopPropagation(); setDragging({ kind: 'work', id: work.id, parentId: stage.id }); }} onDragOver={event => event.preventDefault()} onDrop={event => { event.stopPropagation(); void dropWork(stage.id, work.id); }}>
                                                <i className="fa-solid fa-grip-lines sp-grip" />
                                                <button type="button" className="sp-node-main" onClick={() => setTreeEditor({ mode: 'edit', kind: 'work', nodeId: work.id, parentId: stage.id, title: work.title, description: work.description })}><small>{work.work_key}</small><strong>{work.title}</strong><span className={`state-${work.status}`}>{work.status}</span></button>
                                                <div className="sp-node-tools"><button type="button" title="دستورها و نتیجه" onClick={() => void inspectNode('work', work.id, work.title)}><i className="fa-solid fa-eye" /></button><button type="button" title="افزودن Work بعد از این نود" onClick={() => setTreeEditor({ mode: 'create', kind: 'work', parentId: stage.id, position: workIndex + 1 })}><i className="fa-solid fa-plus" /></button><button type="button" title={locked ? 'Work اجرا شده و قابل حذف نیست' : 'حذف Work'} disabled={locked} onClick={() => void command('tree-delete', { kind: 'work', nodeId: work.id }, 'Work حذف شد.')}><i className="fa-solid fa-xmark" /></button></div>
                                            </div>;
                                        })}
                                        <button type="button" className="sp-insert-node" onClick={() => setTreeEditor({ mode: 'create', kind: 'work', parentId: stage.id, position: stage.works.length })}><i className="fa-solid fa-plus" /> افزودن Work</button>
                                    </div>
                                    {stageIndex < data.workspace.stages.length - 1 && <button type="button" className="sp-between-stage" title="افزودن Stage در این نقطه" onClick={() => setTreeEditor({ mode: 'create', kind: 'stage', position: stageIndex + 1 })}><i className="fa-solid fa-circle-plus" /></button>}
                                </div>;
                            })}
                        </div>
                    </aside>

                    <main className="sp-chat-panel sp-card">
                        <div className="sp-inner-tabs">
                            <button type="button" className={activeInspector === 'chat' ? 'active' : ''} onClick={() => setActiveInspector('chat')}><i className="fa-solid fa-comments" /> گفت‌وگو</button>
                            {inspectors.map(item => <button type="button" key={item.id} className={activeInspector === item.id ? 'active' : ''} onClick={() => setActiveInspector(item.id)}><i className="fa-solid fa-terminal" />{item.title}<i className="fa-solid fa-xmark" onClick={event => { event.stopPropagation(); setInspectors(current => current.filter(tabItem => tabItem.id !== item.id)); setActiveInspector('chat'); }} /></button>)}
                        </div>
                        {activeInspector === 'chat' ? <>
                            {latestRequest && <div className={`sp-ai-progress state-${latestRequest.status}`}>
                                <div className="sp-ai-progress-head"><span><i className={requestActive ? 'fa-solid fa-spinner fa-spin' : latestRequest.status === 'completed' ? 'fa-solid fa-circle-check' : 'fa-solid fa-triangle-exclamation'} /><strong>{latestRequest.status === 'completed' ? 'چرخه ChatGPT تکمیل شد' : latestRequest.status === 'failed' ? 'چرخه ChatGPT ناموفق بود' : 'چرخه ChatGPT در حال اجراست'}</strong></span><small>{faDate(latestRequest.created_at)}</small></div>
                                <div className="sp-ai-timeline">
                                    {transportHistory.length === 0
                                        ? <span className="active"><i className="fa-solid fa-clock" />در صف Worker</span>
                                        : transportHistory.map((item, index) => <span key={`${safeText(item.stage)}-${index}`} className={index === transportHistory.length - 1 ? 'active' : 'done'} title={safeText(item.at)}><i className={`fa-solid ${safeText(item.stage) === 'failed' ? 'fa-circle-xmark' : index === transportHistory.length - 1 && requestActive ? 'fa-spinner fa-spin' : 'fa-circle-check'}`} />{TRANSPORT_LABELS[safeText(item.stage)] ?? safeText(item.stage)}</span>)}
                                </div>
                                {latestRequest.last_error && <div className="sp-ai-error"><i className="fa-solid fa-bug" /><span><strong>علت توقف</strong>{errorLabel(latestRequest.last_error)}<code dir="ltr">{latestRequest.last_error}</code></span></div>}
                            </div>}
                            <div className="sp-chat-scroll">
                                {data.planning.messages.length === 0 && <div className="sp-empty-chat"><i className="fa-solid fa-wand-magic-sparkles" /><h3>ایده آمادهٔ ارزیابی است</h3><p>تنظیمات را کامل و اولین چرخه را برای ChatGPT ارسال کنید.</p></div>}
                                {data.planning.messages.map(message => <article key={message.id} className={`sp-message role-${message.role}`}>
                                    <header>
                                        <strong>{message.role === 'user' ? 'شما' : message.role === 'assistant' ? 'هوش مصنوعی' : 'StagePilot'}</strong>
                                        <span>{faDate(message.created_at)}</span>
                                        <button
                                            type="button"
                                            className="sp-message-delete"
                                            title="حذف این پیام"
                                            disabled={Boolean(busy)}
                                            onClick={() => {
                                                if (window.confirm('این پیام از گفت‌وگوی پروژه حذف شود؟')) {
                                                    void command('message-delete', { messageId: message.id }, 'پیام حذف شد.');
                                                }
                                            }}
                                        ><i className="fa-solid fa-trash-can" /></button>
                                    </header>
                                    <p>{message.content}</p>
                                    {message.role === 'assistant' && message.message_type === 'proposal_draft' && <div className="sp-message-actions">
                                        <button
                                            type="button"
                                            className="btn sp-primary"
                                            disabled={Boolean(busy) || requestActive}
                                            onClick={() => void command(
                                                'proposal-finalize',
                                                { messageId: message.id },
                                                'این پاسخ به پروپوزال رسمی پروژه تبدیل شد.'
                                            )}
                                        ><i className="fa-solid fa-file-circle-check" /> تبدیل به پروپوزال رسمی</button>
                                    </div>}
                                </article>)}
                            </div>
                            <form className="sp-chat-composer" onSubmit={event => { event.preventDefault(); const formElement = event.currentTarget; const form = new FormData(formElement); void command('planning-comment', { content: String(form.get('content') ?? '') }, 'نظر ثبت و چرخه جدید به ChatGPT ارسال شد.').then(result => { if (result) formElement.reset(); }); }}>
                                <textarea name="content" required rows={3} maxLength={30000} autoComplete="off" placeholder="نظر، محدودیت یا تغییر موردنظر را بنویسید…" />
                                <div><button type="submit" className="btn sp-primary" disabled={Boolean(busy) || requestActive}><i className="fa-solid fa-paper-plane" /> ارسال نظر به ChatGPT</button><button type="button" className="btn btn-outline-primary" disabled={Boolean(busy) || requestActive} onClick={() => void command('planning-evaluate', {}, 'پرامپت حرفه‌ای ساخت پروپوزال به ChatGPT ارسال شد.')}><i className="fa-solid fa-wand-magic-sparkles" /> ساخت پروپوزال با ChatGPT</button></div>
                            </form>
                        </> : (() => {
                            const inspector = inspectors.find(item => item.id === activeInspector);
                            if (!inspector) return null;
                            return <div className="sp-inspector-scroll"><div className="sp-inspector-summary"><strong>{safeText(inspector.data.node.node_key)}</strong><span>{safeText(inspector.data.node.status)}</span></div>
                                <h4>دستورهای ساخته‌شده توسط AI</h4>{inspector.data.prompts.length === 0 ? <p className="text-muted">هنوز دستوری ثبت نشده است.</p> : inspector.data.prompts.map((prompt, index) => <details key={safeText(prompt.id)} open={index === 0}><summary>{safeText(prompt.request_key)} · {safeText(prompt.status)}</summary><pre>{safeText(prompt.prompt_text)}</pre>{prompt.raw_text ? <><h5>پاسخ AI</h5><pre>{safeText(prompt.raw_text)}</pre></> : null}</details>)}
                                <h4>اجرا، تست و Git</h4>{inspector.data.attempts.map(attempt => <details key={safeText(attempt.id)}><summary>{safeText(attempt.run_key)} · {safeText(attempt.status)}</summary><pre>{safeText(attempt.test_command || attempt.result_json || attempt.error_text)}</pre><p>Commit: <code>{safeText(attempt.commit_sha) || '—'}</code></p></details>)}
                                {inspector.data.runs.map(run => <details key={safeText(run.id)}><summary>{safeText(run.run_key)} · Exit {safeText(run.exit_code)}</summary><pre>{safeText(run.log || run.result_json)}</pre></details>)}
                            </div>;
                        })()}
                    </main>
                </section>
            )}

            {tab === 'proposal' && (
                <section className="sp-tab-page">
                    <div className="sp-page-title"><div><span>OFFICIAL PROPOSAL</span><h2>پروپوزال رسمی و ساخت PLAN TREE</h2></div><div className="sp-inline-actions">{officialProposal && <button className="btn sp-primary" type="button" disabled={Boolean(busy) || requestActive} onClick={() => void command('plan-tree-generate', {}, 'پرامپت حرفه‌ای ساخت Stage و Work به ChatGPT ارسال شد.')}><i className="fa-solid fa-diagram-project" /> ساخت Stage و Work با ChatGPT</button>}</div></div>
                    {!officialProposal ? <div className="sp-card sp-empty-proposal"><i className="fa-solid fa-file-circle-plus" /><h3>پروپوزال رسمی هنوز انتخاب نشده</h3><p>در گفت‌وگو «ساخت پروپوزال با ChatGPT» را بزنید و سپس پاسخ مناسب را به پروپوزال رسمی تبدیل کنید.</p><button className="btn sp-primary" type="button" onClick={() => selectTab('workspace')}>رفتن به گفت‌وگو</button></div> : <div className="sp-proposal-grid">
                        <article className="sp-card sp-proposal-meta"><div><span>نسخه</span><strong>{faNumber(officialProposal.version)}</strong></div><div><span>وضعیت</span><strong>{officialProposal.status}</strong></div><div><span>عنوان</span><strong>{officialProposal.title}</strong></div><p>{officialProposal.summary}</p>{latestPlan && <small>آخرین PLAN TREE: نسخه {faNumber(latestPlan.version)} · {latestPlan.status}</small>}</article>
                        <article className="sp-card sp-rich-proposal-editor">
                            <div className="sp-card-title"><i className="fa-solid fa-pen-ruler" /><div><h3>ویرایشگر حرفه‌ای پروپوزال</h3><p>ویرایش دیداری شبیه Word، کد HTML و نتیجه نهایی را در یک محیط کنترل کنید.</p></div></div>
                            <div className="sp-editor-modes" role="tablist" aria-label="حالت ویرایش پروپوزال">
                                <button type="button" className={proposalEditorMode === 'visual' ? 'active' : ''} onClick={() => setProposalEditorMode('visual')}><i className="fa-solid fa-file-word" /> ویرایش دیداری</button>
                                <button type="button" className={proposalEditorMode === 'html' ? 'active' : ''} onClick={() => setProposalEditorMode('html')}><i className="fa-solid fa-code" /> کد HTML</button>
                                <button type="button" className={proposalEditorMode === 'preview' ? 'active' : ''} onClick={() => setProposalEditorMode('preview')}><i className="fa-solid fa-eye" /> نمایش نتیجه</button>
                            </div>
                            <div className={`sp-quill-shell ${proposalEditorMode === 'visual' ? '' : 'd-none'}`} dir="rtl"><div ref={quillHostRef} /></div>
                            {proposalEditorMode === 'html' && <textarea className="sp-proposal-code" dir="ltr" spellCheck={false} value={proposalSource} onChange={event => setProposalSource(event.target.value)} />}
                            {proposalEditorMode === 'preview' && <iframe className="sp-proposal-result" title="نمایش نتیجه پروپوزال" sandbox="" srcDoc={proposalSource} />}
                            <div className="sp-editor-footer"><small>اسکریپت و کدهای ناامن هنگام ذخیره پذیرفته نمی‌شوند.</small><button className="btn sp-primary" type="button" disabled={Boolean(busy)} onClick={() => void command('proposal-html', { html: proposalSource }, 'نسخهٔ HTML پروپوزال رسمی ذخیره شد.')}><i className="fa-solid fa-floppy-disk" /> ذخیره پروپوزال</button></div>
                        </article>
                    </div>}
                </section>
            )}

            {tab === 'overview' && (
                <section className="sp-tab-page">
                    <div className="sp-page-title"><div><span>AUTONOMOUS MANAGER</span><h2>وضعیت اجرای خودکار</h2></div><div className="sp-inline-actions">{automationStatus === 'paused' ? <button className="btn sp-primary" onClick={() => void command('automation', { command: 'resume' }, 'چرخه ادامه یافت.')}><i className="fa-solid fa-play" /> ادامه</button> : <button className="btn btn-outline-warning" onClick={() => void command('automation', { command: 'pause' }, 'توقف امن ثبت شد.')}><i className="fa-solid fa-pause" /> توقف امن</button>}<button className="btn btn-outline-primary" onClick={() => void command('automation', { command: data.automation.state ? 'retry' : 'start' }, 'مدیر خودکار در صف اجرا قرار گرفت.')}><i className="fa-solid fa-rotate-right" /> شروع / تلاش دوباره</button></div></div>
                    <div className="sp-overview-grid"><article className="sp-card"><i className="fa-solid fa-microchip" /><span>Worker</span><strong>{data.automation.worker?.status ?? 'offline'}</strong><small>{data.automation.worker?.heartbeat_at ? faDate(data.automation.worker.heartbeat_at) : 'بدون heartbeat'}</small></article><article className="sp-card"><i className="fa-solid fa-repeat" /><span>چرخه‌ها</span><strong>{faNumber(Number(data.automation.state?.cycle_no ?? 0))}</strong><small>AI → اجرا → تست → Git</small></article><article className="sp-card"><i className="fa-solid fa-code-commit" /><span>آخرین Commit</span><strong dir="ltr">{data.automation.attempts.find(item => item.commit_sha)?.commit_sha?.slice(0, 12) ?? '—'}</strong><small>پس از تست موفق</small></article></div>
                    <article className="sp-card sp-attempt-list"><h3>تلاش‌های اخیر</h3>{data.automation.attempts.length === 0 ? <p>هنوز اجرایی ثبت نشده است.</p> : data.automation.attempts.map(attempt => <div key={attempt.id}><span className={`sp-log-level state-${attempt.status}`}>{attempt.status}</span><strong>{attempt.stage_key} / {attempt.work_key}</strong><small>{faDate(attempt.started_at)}</small><code>{attempt.commit_sha?.slice(0, 12) ?? attempt.error_text ?? '—'}</code></div>)}</article>
                </section>
            )}

            {tab === 'logs' && (
                <section className="sp-tab-page"><div className="sp-page-title"><div><span>AUDIT TRAIL</span><h2>لاگ قابل فهم پروژه</h2></div><p>تنظیمات، ساخت چت، پاسخ AI، اجرای Work، تست و Git به‌ترتیب زمان ثبت می‌شوند.</p></div><article className="sp-card sp-event-log">{data.workspace.events.length === 0 ? <p>هنوز رویدادی ثبت نشده است.</p> : data.workspace.events.map(event => <div key={event.id}><span className={`sp-log-level severity-${event.severity}`}>{event.severity}</span><i className="fa-solid fa-circle" /><div><strong>{event.event_type}</strong><p>{event.message || 'رویداد بدون توضیح'}</p><small>{faDate(event.created_at)} · {event.actor_type}</small></div><details><summary><i className="fa-solid fa-code" /></summary><pre>{JSON.stringify(event.data, null, 2)}</pre></details></div>)}</article></section>
            )}

            {treeEditor && <div className="sp-modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setTreeEditor(null); }}><form className="sp-node-modal" onSubmit={submitTreeEditor}><div className="sp-modal-title"><div><span>{treeEditor.kind.toUpperCase()}</span><h3>{treeEditor.mode === 'create' ? 'افزودن نود' : 'ویرایش نود'}</h3></div><button type="button" onClick={() => setTreeEditor(null)}><i className="fa-solid fa-xmark" /></button></div>{treeEditor.mode === 'create' && <label><span>شناسه پایدار (اختیاری)</span><input name="key" dir="ltr" autoComplete="off" placeholder={treeEditor.kind === 'stage' ? 'S08' : 'S08-W01'} /></label>}<label><span>عنوان</span><input name="title" required maxLength={300} autoComplete="off" defaultValue={treeEditor.title ?? ''} /></label><label><span>شرح و هدف</span><textarea name="description" rows={5} maxLength={5000} autoComplete="off" defaultValue={treeEditor.description ?? ''} /></label><div><button type="button" className="btn btn-light" onClick={() => setTreeEditor(null)}>انصراف</button><button type="submit" className="btn sp-primary" disabled={Boolean(busy)}>ذخیره</button></div></form></div>}
        </div>
    );
}

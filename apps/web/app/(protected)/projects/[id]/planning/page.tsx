import Link from 'next/link';
import { notFound } from 'next/navigation';

import { loadPlanningWorkspace } from '../../../../../lib/planning';
import {
    addPlanningCommentAction,
    approveProjectPlanAction,
    importProjectPlanAction,
    requestPlanningEvaluationAction
} from './actions';


export const dynamic = 'force-dynamic';

type PageProps = {
    params: Promise<{ id: string }>;
    searchParams: Promise<{ error?: string; success?: string }>;
};

function dateLabel(value: string) {
    return new Intl.DateTimeFormat('fa-IR', {
        dateStyle: 'medium',
        timeStyle: 'short'
    }).format(new Date(value));
}


function planKeys(plan: Record<string, unknown>) {
    const stages = Array.isArray(plan.stages) ? plan.stages : [];
    const keys = new Set<string>();
    for (const rawStage of stages) {
        if (!rawStage || typeof rawStage !== 'object') continue;
        const stage = rawStage as { id?: unknown; works?: unknown[] };
        if (typeof stage.id === 'string') keys.add(`stage:${stage.id}`);
        for (const rawWork of Array.isArray(stage.works) ? stage.works : []) {
            if (!rawWork || typeof rawWork !== 'object') continue;
            const workId = (rawWork as { id?: unknown }).id;
            if (typeof workId === 'string') keys.add(`work:${workId}`);
        }
    }
    return keys;
}


function planDiff(
    current: Record<string, unknown>,
    previous?: Record<string, unknown>
) {
    if (!previous) return { added: 0, removed: 0 };
    const now = planKeys(current);
    const before = planKeys(previous);
    return {
        added: [...now].filter(key => !before.has(key)).length,
        removed: [...before].filter(key => !now.has(key)).length
    };
}

export default async function PlanningPage({ params, searchParams }: PageProps) {
    const { id } = await params;
    const query = await searchParams;
    const workspace = await loadPlanningWorkspace(id);
    if (!workspace) notFound();

    const latestPlan = workspace.plans[0] ?? null;
    const planningStatus = String(workspace.project.settings?.planningStatus ?? 'awaiting_planning');

    return (
        <div className="stagepilot-page-stack">
            <div className="stagepilot-back-row stagepilot-project-toolbar">
                <Link href={`/projects/${id}`} className="stagepilot-back-link">← بازگشت به مرکز کنترل پروژه</Link>
                <span>Planning Studio · {workspace.project.slug}</span>
            </div>

            <section className="stagepilot-planning-hero">
                <div>
                    <div className="stagepilot-panel-eyebrow">AI PROJECT DISCOVERY</div>
                    <h2>استودیوی تحلیل ایده و پروپوزال</h2>
                    <p>
                        ایده را در یک گفت‌وگوی کنترل‌شده تحلیل کنید، دربارهٔ فناوری‌ها نظر بدهید،
                        نسخه‌های پروپوزال را مقایسه و فقط نسخهٔ نهایی را به Stage/Work تبدیل کنید.
                    </p>
                </div>
                <div className="stagepilot-planning-state">
                    <span>وضعیت</span>
                    <strong>{planningStatus}</strong>
                    <small>Revision {workspace.project.current_plan_revision}</small>
                </div>
            </section>

            {query.success && <div className="alert alert-success">عملیات برنامه‌ریزی ثبت شد.</div>}
            {query.error && (
                <div className="alert alert-danger">
                    عملیات انجام نشد. برای ارسال به ChatGPT ابتدا حساب و یک چت فعال را در تنظیمات چت پروژه مشخص کنید؛ JSON نیز باید قرارداد StagePilot را رعایت کند.
                </div>
            )}

            <section className="stagepilot-planning-grid">
                <div className="stagepilot-panel stagepilot-chat-studio">
                    <div className="stagepilot-panel-header">
                        <div><div className="stagepilot-panel-eyebrow">DISCUSSION</div><h3>گفت‌وگوی تحلیل ایده</h3></div>
                        <Link href={`/projects/${id}/chat`} className="btn btn-sm btn-outline-secondary">تنظیم حساب و چت</Link>
                    </div>

                    <div className="stagepilot-planning-timeline">
                        {workspace.messages.length === 0 ? (
                            <div className="stagepilot-project-empty compact">
                                <div className="stagepilot-project-empty-mark">AI</div>
                                <h4>گفت‌وگو آماده است</h4>
                                <p>نظر یا محدودیت خود را ثبت کنید و سپس درخواست ارزیابی بفرستید.</p>
                            </div>
                        ) : workspace.messages.map(message => (
                            <article key={message.id} className={`stagepilot-planning-message role-${message.role}`}>
                                <header><strong>{message.role === 'user' ? 'شما' : message.role === 'assistant' ? 'پروپوزال' : 'StagePilot'}</strong><span>{message.message_type} · {dateLabel(message.created_at)}</span></header>
                                <p>{message.content}</p>
                            </article>
                        ))}
                    </div>

                    <form action={addPlanningCommentAction.bind(null, id)} className="stagepilot-planning-composer">
                        <textarea name="content" rows={4} required maxLength={30000} placeholder="نظر، تغییر، محدودیت یا سؤال جدید خود را بنویسید..." />
                        <div>
                            <button type="submit" className="btn btn-outline-primary">ثبت نظر</button>
                            <button formAction={requestPlanningEvaluationAction.bind(null, id)} formNoValidate type="submit" className="btn stagepilot-primary-button">ارسال چرخهٔ ارزیابی به ChatGPT</button>
                        </div>
                    </form>
                </div>

                <aside className="stagepilot-planning-side">
                    <section className="stagepilot-panel">
                        <div className="stagepilot-panel-header"><div><div className="stagepilot-panel-eyebrow">PROMPT QUEUE</div><h3>درخواست‌های تحلیل</h3></div></div>
                        <div className="stagepilot-mini-list">
                            {workspace.promptRequests.length === 0 ? <p>هنوز درخواستی ساخته نشده است.</p> : workspace.promptRequests.map(request => (
                                <div key={request.id}><code>{request.request_key}</code><span className={`stagepilot-state-badge state-${request.status}`}>{request.status}</span></div>
                            ))}
                        </div>
                    </section>

                    <details className="stagepilot-panel stagepilot-import-plan" open={!latestPlan}>
                        <summary><span>IMPORT JSON</span><strong>ثبت خروجی پروپوزال</strong></summary>
                        <form action={importProjectPlanAction.bind(null, id)}>
                            <p>خروجی `project_plan` دریافت‌شده از ChatGPT را وارد کنید. اعتبار شناسه، وابستگی، معیارها و چرخه‌ها بررسی می‌شود.</p>
                            <textarea name="rawJson" dir="ltr" rows={12} required placeholder={'{"responseType":"project_plan","plan":{...}}'} />
                            <button type="submit" className="btn btn-dark w-100">اعتبارسنجی و ثبت نسخه</button>
                        </form>
                    </details>
                </aside>
            </section>

            <section className="stagepilot-panel stagepilot-plan-versions">
                <div className="stagepilot-panel-header">
                    <div><div className="stagepilot-panel-eyebrow">PLAN REVISIONS</div><h3>نسخه‌های پروپوزال</h3></div>
                    {latestPlan && <Link href={`/api/projects/${id}/plan`} className="btn btn-sm btn-outline-dark">دریافت JSON آخرین نسخه</Link>}
                </div>
                {workspace.plans.length === 0 ? (
                    <div className="stagepilot-project-empty compact"><h4>هنوز پروپوزالی ثبت نشده</h4><p>چرخهٔ تحلیل را اجرا یا JSON معتبر را وارد کنید.</p></div>
                ) : (
                    <div className="stagepilot-plan-card-grid">
                        {workspace.plans.map((plan, index) => {
                            const stages = Array.isArray(plan.proposal_json?.stages) ? plan.proposal_json.stages : [];
                            const previousPlan = workspace.plans[index + 1]?.proposal_json;
                            const difference = planDiff(plan.proposal_json, previousPlan);
                            const workCount = stages.reduce((sum: number, stage: unknown) => {
                                const works = typeof stage === 'object' && stage && Array.isArray((stage as { works?: unknown[] }).works) ? (stage as { works: unknown[] }).works.length : 0;
                                return sum + works;
                            }, 0);
                            return (
                                <article key={plan.id} className={`stagepilot-plan-card status-${plan.status}`}>
                                    <header><div><span>نسخه {plan.version}</span><h4>{plan.title}</h4></div><span className={`stagepilot-state-badge state-${plan.status}`}>{plan.status}</span></header>
                                    <p>{plan.summary}</p>
                                    <div className="stagepilot-plan-stats"><span>{stages.length} Stage</span><span>{workCount} Work</span><span>＋{difference.added} / −{difference.removed}</span><span>{dateLabel(plan.created_at)}</span></div>
                                    <details className="stagepilot-plan-tree-preview">
                                        <summary>نمایش ساختار نسخه</summary>
                                        <div>
                                            {stages.map((rawStage, stageIndex) => {
                                                const stage = rawStage as { id?: string; title?: string; works?: Array<{ id?: string; title?: string }> };
                                                return <section key={`${stage.id ?? stageIndex}`}><strong>{stage.id} · {stage.title}</strong><ul>{(stage.works ?? []).map((work, workIndex) => <li key={`${work.id ?? workIndex}`}>{work.id} · {work.title}</li>)}</ul></section>;
                                            })}
                                        </div>
                                    </details>
                                    {plan.status !== 'approved' && (
                                        <form action={approveProjectPlanAction.bind(null, id, plan.version)}>
                                            <button type="submit" className="btn stagepilot-primary-button w-100">تصویب نهایی و ایجاد پروژه</button>
                                        </form>
                                    )}
                                </article>
                            );
                        })}
                    </div>
                )}
            </section>
        </div>
    );
}

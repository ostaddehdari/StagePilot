import Link from 'next/link';

import {
    createProjectAction,
    deleteProjectAction,
    updateProjectAction
} from './actions';

import { loadProjects } from '../../../lib/projects';
import type { ProjectListItem } from '../../../lib/projects';


export const dynamic = 'force-dynamic';

type ProjectsPageProps = {
    searchParams: Promise<{ error?: string; success?: string }>;
};

function numberFormat(value: number) {
    return new Intl.NumberFormat('fa-IR', { maximumFractionDigits: 1 }).format(value);
}

function statusLabel(status: string) {
    return ({
        draft: 'پیش‌نویس',
        active: 'فعال',
        paused: 'متوقف',
        completed: 'تکمیل‌شده'
    } as Record<string, string>)[status] ?? status;
}

export default async function ProjectsPage({ searchParams }: ProjectsPageProps) {
    const params = await searchParams;
    let projects: ProjectListItem[] = [];
    let apiError = false;
    try {
        projects = await loadProjects();
    } catch {
        apiError = true;
    }

    return (
        <div className="stagepilot-page-stack">
            <section className="stagepilot-section-heading stagepilot-heading-card">
                <div>
                    <div className="stagepilot-panel-eyebrow">PROJECT PORTFOLIO</div>
                    <h2>پروژه‌ها</h2>
                    <p>
                        همهٔ پروژه‌ها، وضعیت برنامه‌ریزی، مخزن، Stageها و پیشرفت تأییدشده
                        در یک نمای مدیریتی قابل کنترل هستند.
                    </p>
                </div>
                <div className="stagepilot-heading-actions">
                    <div className="stagepilot-section-count">
                        {numberFormat(projects.length)}<span>پروژه</span>
                    </div>
                    <details className="stagepilot-create-drawer">
                        <summary className="btn stagepilot-primary-button">＋ پروژهٔ جدید</summary>
                        <div className="stagepilot-drawer-panel">
                            <div className="stagepilot-drawer-heading">
                                <div><span>NEW PROJECT</span><h3>ایده را ثبت کنید</h3></div>
                                <p>پس از ثبت، گفت‌وگوی تحلیل ایده و ساخت پروپوزال آغاز می‌شود.</p>
                            </div>
                            <form action={createProjectAction} className="stagepilot-form-grid">
                                <label>
                                    <span>نام پروژه</span>
                                    <input name="name" required minLength={2} maxLength={160} placeholder="مثلاً سامانه مدیریت محتوای هوشمند" />
                                </label>
                                <label>
                                    <span>شناسه انگلیسی</span>
                                    <input name="slug" dir="ltr" pattern="[a-z0-9][a-z0-9-]{2,62}" placeholder="smart-content-platform" />
                                </label>
                                <label className="stagepilot-form-wide">
                                    <span>توضیح کوتاه</span>
                                    <textarea name="description" rows={2} maxLength={5000} placeholder="مسئله و هدف کلی پروژه" />
                                </label>
                                <label className="stagepilot-form-wide">
                                    <span>ایده و نیازمندی اولیه</span>
                                    <textarea name="requestText" rows={6} minLength={10} maxLength={30000} required placeholder="ایده، کاربران، محدودیت‌ها و نتیجه‌ای که انتظار دارید..." />
                                </label>
                                <div className="stagepilot-form-actions stagepilot-form-wide">
                                    <button type="submit" className="btn stagepilot-primary-button">ثبت و شروع تحلیل ایده</button>
                                </div>
                            </form>
                        </div>
                    </details>
                </div>
            </section>

            {params.success && <div className="alert alert-success">عملیات پروژه با موفقیت انجام شد.</div>}
            {params.error && <div className="alert alert-danger">عملیات پروژه انجام نشد. داده‌ها و وابستگی‌ها را بررسی کنید.</div>}
            {apiError && <div className="alert alert-warning">API پروژه‌ها در دسترس نیست.</div>}

            <section className="stagepilot-panel stagepilot-table-panel">
                <div className="stagepilot-panel-header">
                    <div><div className="stagepilot-panel-eyebrow">ALL PROJECTS</div><h3>فهرست پروژه‌ها</h3></div>
                    <span className="stagepilot-live-pill">همگام با پایگاه داده</span>
                </div>

                {projects.length === 0 ? (
                    <div className="stagepilot-project-empty">
                        <div className="stagepilot-project-empty-mark">P</div>
                        <h4>هنوز پروژه‌ای ثبت نشده</h4>
                        <p>دکمهٔ «پروژهٔ جدید» را بزنید و ایده را وارد کنید.</p>
                    </div>
                ) : (
                    <div className="table-responsive">
                        <table className="table stagepilot-data-table align-middle">
                            <thead><tr><th>پروژه</th><th>وضعیت</th><th>Stage / Work</th><th>پیشرفت معتبر</th><th>مخزن</th><th>عملیات</th></tr></thead>
                            <tbody>
                                {projects.map(project => {
                                    const settings = project.settings ?? {};
                                    const repositoryName = String(settings.repositoryName ?? '—');
                                    return (
                                        <tr key={project.id}>
                                            <td>
                                                <div className="stagepilot-table-title">{project.name}</div>
                                                <code>{project.slug}</code>
                                                <div className="stagepilot-table-description">{project.description || 'بدون توضیح کوتاه'}</div>
                                            </td>
                                            <td><span className={`stagepilot-state-badge state-${project.status}`}>{statusLabel(project.status)}</span></td>
                                            <td><strong>{numberFormat(project.stage_count)}</strong><span className="stagepilot-table-separator">/</span><strong>{numberFormat(project.work_count)}</strong></td>
                                            <td className="stagepilot-progress-cell">
                                                <div className="stagepilot-progress-track"><span style={{ width: `${Math.min(100, project.progress_percent)}%` }} /></div>
                                                <small>{numberFormat(project.progress_percent)}٪</small>
                                            </td>
                                            <td><code>{repositoryName}</code></td>
                                            <td>
                                                <div className="stagepilot-row-actions">
                                                    <Link href={`/projects/${project.id}`} className="btn btn-sm btn-dark">مرکز کنترل</Link>
                                                    <Link href={`/projects/${project.id}/planning`} className="btn btn-sm btn-outline-primary">پروپوزال</Link>
                                                    <details className="stagepilot-row-menu">
                                                        <summary className="btn btn-sm btn-outline-secondary">ویرایش</summary>
                                                        <form action={updateProjectAction.bind(null, project.id)} className="stagepilot-inline-editor">
                                                            <label>نام<input name="name" defaultValue={project.name} required /></label>
                                                            <label>شناسه<input name="slug" dir="ltr" defaultValue={project.slug} required /></label>
                                                            <label>توضیح<textarea name="description" rows={2} defaultValue={project.description ?? ''} /></label>
                                                            <label>نام مخزن<input name="repositoryName" dir="ltr" defaultValue={repositoryName === '—' ? '' : repositoryName} /></label>
                                                            <label>حالت چت<select name="chatMode" defaultValue={String(settings.chatMode ?? 'existing')}><option value="existing">ثبت آدرس چت موجود</option><option value="new">ساخت چت جدید</option></select></label>
                                                            <label>وضعیت<select name="status" defaultValue={project.status}><option value="draft">پیش‌نویس</option><option value="active">فعال</option><option value="paused">متوقف</option><option value="completed">تکمیل‌شده</option></select></label>
                                                            <button className="btn btn-sm btn-primary" type="submit">ذخیره</button>
                                                        </form>
                                                    </details>
                                                    <details className="stagepilot-row-menu danger">
                                                        <summary className="btn btn-sm btn-outline-danger">حذف</summary>
                                                        <div className="stagepilot-delete-confirm">
                                                            <p>پروژه از فهرست حذف می‌شود؛ تاریخچه و شواهد برای بازیابی حفظ خواهند شد.</p>
                                                            <form action={deleteProjectAction.bind(null, project.id)}><button type="submit" className="btn btn-sm btn-danger">تأیید حذف</button></form>
                                                        </div>
                                                    </details>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>
        </div>
    );
}

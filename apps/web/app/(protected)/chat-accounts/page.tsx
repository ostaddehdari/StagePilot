import Link from 'next/link';

import {
    createChatAccountAction,
    deleteChatAccountAction,
    updateChatAccountAction
} from './actions';

import { loadChatAccounts } from '../../../lib/chat-accounts';
import type { ChatAccountListItem } from '../../../lib/chat-accounts';


export const dynamic = 'force-dynamic';

type PageProps = {
    searchParams: Promise<{ error?: string; success?: string }>;
};

function statusLabel(status?: string | null) {
    if (!status) return 'نامشخص';
    return ({
        needs_login: 'نیازمند ورود',
        ready: 'آماده',
        busy: 'مشغول',
        expired: 'ورود منقضی',
        error: 'خطا',
        stopped: 'متوقف',
        unknown: 'نامشخص'
    } as Record<string, string>)[status] ?? status;
}

function numberFormat(value: number) {
    return new Intl.NumberFormat('fa-IR').format(value);
}

export default async function ChatAccountsPage({ searchParams }: PageProps) {
    const params = await searchParams;
    let accounts: ChatAccountListItem[] = [];
    let apiError = false;
    try {
        accounts = await loadChatAccounts();
    } catch {
        apiError = true;
    }

    return (
        <div className="stagepilot-page-stack">
            <section className="stagepilot-section-heading stagepilot-heading-card">
                <div>
                    <div className="stagepilot-panel-eyebrow">CHATGPT ACCOUNTS</div>
                    <h2>حساب‌های ChatGPT</h2>
                    <p>
                        هر حساب Profile مرورگر مستقل دارد؛ noVNC فقط برای ورود و اجرای عادی
                        به‌صورت Headless انجام می‌شود.
                    </p>
                </div>
                <div className="stagepilot-heading-actions">
                    <div className="stagepilot-section-count">{numberFormat(accounts.length)}<span>حساب</span></div>
                    <details className="stagepilot-create-drawer">
                        <summary className="btn stagepilot-primary-button">＋ حساب جدید</summary>
                        <div className="stagepilot-drawer-panel stagepilot-drawer-small">
                            <div className="stagepilot-drawer-heading"><div><span>NEW ACCOUNT</span><h3>ساخت Profile مستقل</h3></div></div>
                            <form action={createChatAccountAction} className="stagepilot-form-grid">
                                <label className="stagepilot-form-wide"><span>نام حساب</span><input name="label" required minLength={2} maxLength={120} placeholder="مثلاً حساب اصلی Pro" /></label>
                                <label className="stagepilot-form-wide"><span>یادداشت</span><textarea name="note" rows={3} maxLength={2000} placeholder="کاربرد این حساب و پروژه‌های مرتبط" /></label>
                                <button type="submit" className="btn stagepilot-primary-button stagepilot-form-wide">ساخت Profile</button>
                            </form>
                        </div>
                    </details>
                </div>
            </section>

            {params.success && <div className="alert alert-success">عملیات حساب با موفقیت انجام شد.</div>}
            {params.error && <div className="alert alert-danger">عملیات حساب انجام نشد؛ حساب‌های فعال در چت قابل حذف نیستند.</div>}
            {apiError && <div className="alert alert-warning">API حساب‌های ChatGPT در دسترس نیست.</div>}

            <section className="stagepilot-panel stagepilot-table-panel">
                <div className="stagepilot-panel-header">
                    <div><div className="stagepilot-panel-eyebrow">BROWSER PROFILES</div><h3>همهٔ حساب‌ها</h3></div>
                    <span className="stagepilot-live-pill">Profileهای ایزوله</span>
                </div>
                {accounts.length === 0 ? (
                    <div className="stagepilot-project-empty"><div className="stagepilot-project-empty-mark">C</div><h4>هنوز حسابی ثبت نشده</h4><p>با دکمهٔ «حساب جدید» اولین Profile را بسازید.</p></div>
                ) : (
                    <div className="table-responsive">
                        <table className="table stagepilot-data-table align-middle">
                            <thead><tr><th>حساب</th><th>وضعیت</th><th>حالت مرورگر</th><th>پروژه / چت</th><th>Profile Key</th><th>عملیات</th></tr></thead>
                            <tbody>
                                {accounts.map(account => (
                                    <tr key={account.id}>
                                        <td>
                                            <div className="stagepilot-account-identity">
                                                <span className="stagepilot-account-avatar">GPT</span>
                                                <div><div className="stagepilot-table-title">{account.label}</div><small>{String(account.metadata?.note ?? 'بدون یادداشت')}</small></div>
                                            </div>
                                        </td>
                                        <td><span className={`stagepilot-state-badge state-${account.status}`}>{statusLabel(account.status)}</span></td>
                                        <td><code>{account.browser_mode ?? 'headless'}</code></td>
                                        <td>{numberFormat(account.selected_project_count)} / {numberFormat(account.conversation_count)}</td>
                                        <td><code>{account.profile_key}</code></td>
                                        <td>
                                            <div className="stagepilot-row-actions">
                                                <Link href={`/chat-accounts/${account.id}`} className="btn btn-sm btn-dark">مدیریت ورود</Link>
                                                <details className="stagepilot-row-menu">
                                                    <summary className="btn btn-sm btn-outline-secondary">ویرایش</summary>
                                                    <form action={updateChatAccountAction.bind(null, account.id)} className="stagepilot-inline-editor">
                                                        <label>نام<input name="label" defaultValue={account.label} required /></label>
                                                        <label>یادداشت<textarea name="note" rows={3} defaultValue={String(account.metadata?.note ?? '')} /></label>
                                                        <button type="submit" className="btn btn-sm btn-primary">ذخیره</button>
                                                    </form>
                                                </details>
                                                <details className="stagepilot-row-menu danger">
                                                    <summary className="btn btn-sm btn-outline-danger">حذف</summary>
                                                    <div className="stagepilot-delete-confirm">
                                                        <p>حساب غیرفعال می‌شود؛ Profile برای بازیابی امن حفظ خواهد شد.</p>
                                                        <form action={deleteChatAccountAction.bind(null, account.id)}><button type="submit" className="btn btn-sm btn-danger">تأیید حذف</button></form>
                                                    </div>
                                                </details>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>
        </div>
    );
}

import { loadSiteSettings } from '../../../lib/site-settings';
import { updateSiteSettingsAction } from './actions';


export const dynamic = 'force-dynamic';

type PageProps = {
    searchParams: Promise<{ error?: string; success?: string }>;
};

export default async function SettingsPage({ searchParams }: PageProps) {
    const query = await searchParams;
    const settings = await loadSiteSettings();

    return (
        <div className="stagepilot-page-stack">
            <section className="stagepilot-section-heading stagepilot-heading-card">
                <div>
                    <div className="stagepilot-panel-eyebrow">SYSTEM CONFIGURATION</div>
                    <h2>تنظیمات StagePilot</h2>
                    <p>تنظیمات اتصال GitHub و پیش‌فرض‌های ساخت مخزن در این بخش مدیریت می‌شوند.</p>
                </div>
                <div className={`stagepilot-connection-card ${settings.tokenConfigured ? 'connected' : ''}`}>
                    <span className="stagepilot-status-dot" />
                    <div><strong>{settings.tokenConfigured ? 'توکن پیکربندی شده' : 'توکن تنظیم نشده'}</strong><small>GitHub Repository API</small></div>
                </div>
            </section>

            {query.success && <div className="alert alert-success">تنظیمات با موفقیت و بدون نمایش اسرار ذخیره شد.</div>}
            {query.error && <div className="alert alert-danger">ذخیرهٔ تنظیمات انجام نشد. نام کاربری و Fine-grained PAT را بررسی کنید.</div>}

            <section className="stagepilot-settings-layout">
                <form action={updateSiteSettingsAction} className="stagepilot-panel stagepilot-settings-form">
                    <div className="stagepilot-panel-header">
                        <div><div className="stagepilot-panel-eyebrow">GITHUB CONNECTION</div><h3>حساب و دسترسی GitHub</h3></div>
                        <span className="stagepilot-secret-badge">Secrets → file 0600</span>
                    </div>
                    <div className="stagepilot-form-grid">
                        <label><span>مالک مخزن (Owner)</span><input name="githubOwner" dir="ltr" required autoComplete="organization" defaultValue={settings.githubOwner} placeholder="ostaddehdari" /></label>
                        <label><span>نام کاربری</span><input name="githubUsername" dir="ltr" required autoComplete="username" defaultValue={settings.githubUsername} placeholder="ostaddehdari" /></label>
                        <label><span>Fine-grained Personal Access Token</span><input name="githubToken" dir="ltr" type="password" autoComplete="new-password" placeholder={settings.tokenConfigured ? 'برای حفظ توکن فعلی خالی بگذارید' : 'github_pat_...'} /></label>
                        <label><span>رمز عبور حساب (اختیاری)</span><input name="githubPassword" dir="ltr" type="password" autoComplete="new-password" placeholder={settings.passwordConfigured ? 'برای حفظ مقدار فعلی خالی بگذارید' : 'ذخیره می‌شود اما GitHub از آن استفاده نمی‌کند'} /></label>
                        <label><span>نام پیش‌فرض مخزن</span><input name="defaultRepository" dir="ltr" autoComplete="off" defaultValue={settings.defaultRepository} placeholder="my-project" /></label>
                        <label><span>سطح دسترسی پیش‌فرض</span><select name="defaultVisibility" defaultValue={settings.defaultVisibility}><option value="private">Private</option><option value="public">Public</option></select></label>
                    </div>
                    <div className="stagepilot-security-note">
                        <strong>نکتهٔ امنیتی</strong>
                        <p>GitHub برای Git و API از رمز عبور حساب استفاده نمی‌کند؛ اتصال عملی با PAT محدود یا کلید SSH انجام می‌شود. اسرار در UI، لاگ یا مخزن Git نمایش داده نمی‌شوند.</p>
                    </div>
                    <button type="submit" className="btn stagepilot-primary-button">ذخیرهٔ امن تنظیمات</button>
                </form>

                <aside className="stagepilot-panel stagepilot-settings-guide">
                    <div className="stagepilot-panel-eyebrow">CONNECTION CHECKLIST</div>
                    <h3>مجوزهای لازم</h3>
                    <ol>
                        <li><strong>Repository access</strong><span>فقط مخزن‌های موردنیاز یا All repositories طبق نیاز.</span></li>
                        <li><strong>Contents: Read and write</strong><span>برای Commit و Push برنامه و کد.</span></li>
                        <li><strong>Metadata: Read</strong><span>برای تطبیق هویت مخزن و شاخه.</span></li>
                        <li><strong>Administration</strong><span>فقط اگر StagePilot باید مخزن جدید ایجاد کند.</span></li>
                    </ol>
                </aside>
            </section>
        </div>
    );
}

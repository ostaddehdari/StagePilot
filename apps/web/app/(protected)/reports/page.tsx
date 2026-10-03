import { reportMetrics } from '../../../components/archive-console';
import { loadArchiveSummary } from '../../../lib/archive';

export const dynamic = 'force-dynamic';

export default async function ReportsPage() {
    const summary = await loadArchiveSummary();
    return (
        <div className="stagepilot-page-stack">
            <section className="stagepilot-section-heading stagepilot-heading-card"><div><div className="stagepilot-panel-eyebrow">VERIFIED REPORTS</div><h2>گزارش‌های مدیریتی</h2><p>شاخص‌های واقعی از پایگاه داده؛ مقدار نامعلوم به‌جای حدس‌زدن، نامعلوم باقی می‌ماند.</p></div></section>
            <section className="row g-3">
                {reportMetrics(summary).map(([label, amount]) => <div className="col-6 col-lg-3" key={label}><article className="stagepilot-stat-card"><div className="stagepilot-stat-label">{label}</div><div className="stagepilot-stat-value">{new Intl.NumberFormat('fa-IR').format(amount)}</div><div className="stagepilot-stat-hint">ثبت‌شده و قابل ردیابی</div></article></div>)}
            </section>
        </div>
    );
}

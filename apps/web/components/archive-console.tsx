import Link from 'next/link';

import type { ArchiveSummary } from '../lib/archive';


function value(
    row: Record<string, unknown>,
    keys: string[]
) {
    for (const key of keys) {
        if (row[key] !== undefined && row[key] !== null) {
            return String(row[key]);
        }
    }
    return '—';
}


export function ArchiveConsole({
    eyebrow,
    title,
    description,
    metric,
    rows,
    kind
}: {
    eyebrow: string;
    title: string;
    description: string;
    metric: { label: string; value: number };
    rows: Array<Record<string, unknown>>;
    kind: 'prompt' | 'run' | 'git';
}) {
    return (
        <div className="stagepilot-page-stack">
            <section className="stagepilot-section-heading stagepilot-heading-card">
                <div><div className="stagepilot-panel-eyebrow">{eyebrow}</div><h2>{title}</h2><p>{description}</p></div>
                <div className="stagepilot-section-count">{new Intl.NumberFormat('fa-IR').format(metric.value)}<span>{metric.label}</span></div>
            </section>
            <section className="stagepilot-panel stagepilot-table-panel">
                <div className="stagepilot-panel-header"><div><div className="stagepilot-panel-eyebrow">RECENT RECORDS</div><h3>آخرین رکوردهای واقعی</h3></div><Link href="/archive" className="btn btn-sm btn-outline-dark">آرشیو کامل</Link></div>
                <div className="table-responsive">
                    <table className="table stagepilot-data-table align-middle">
                        <thead><tr><th>شناسه</th><th>پروژه / عنوان</th><th>وضعیت</th><th>مرجع</th><th>زمان</th></tr></thead>
                        <tbody>
                            {rows.length === 0 ? <tr><td colSpan={5}>هنوز رکوردی ثبت نشده است.</td></tr> : rows.map((row, index) => {
                                const id = value(row, ['id']);
                                const href = kind === 'prompt' ? `/archive/prompts/${id}` : kind === 'run' ? `/archive/runs/${id}` : '/archive';
                                return (
                                    <tr key={`${id}-${index}`}>
                                        <td><Link href={href}><code>{value(row, ['request_key', 'run_key', 'id'])}</code></Link></td>
                                        <td>{value(row, ['project_name', 'title', 'repository', 'operation_type'])}</td>
                                        <td><span className={`stagepilot-state-badge state-${value(row, ['status'])}`}>{value(row, ['status'])}</span></td>
                                        <td><code>{value(row, ['request_type', 'target_server', 'branch', 'commit_sha'])}</code></td>
                                        <td>{value(row, ['created_at', 'completed_at'])}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </section>
        </div>
    );
}


export function reportMetrics(summary: ArchiveSummary) {
    return [
        ['Prompt', summary.counts.prompts],
        ['Response', summary.counts.responses],
        ['Script', summary.counts.scripts],
        ['Run', summary.counts.runs],
        ['Log', summary.counts.logs],
        ['Test', summary.counts.test_results],
        ['Git', summary.counts.git_operations]
    ] as Array<[string, number]>;
}

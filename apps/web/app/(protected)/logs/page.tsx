import { ArchiveConsole } from '../../../components/archive-console';
import { loadArchiveSummary } from '../../../lib/archive';

export const dynamic = 'force-dynamic';

export default async function LogsPage() {
    const summary = await loadArchiveSummary();
    return <ArchiveConsole eyebrow="RUN & LOG CENTER" title="لاگ‌ها و اجراها" description="خروجی‌های Run، وضعیت سرور و رسید اجرای قابل پیگیری." metric={{ label: 'قطعه لاگ', value: summary.counts.logs }} rows={summary.recentRuns} kind="run" />;
}

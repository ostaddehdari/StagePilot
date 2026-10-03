import { ArchiveConsole } from '../../../components/archive-console';
import { loadArchiveSummary } from '../../../lib/archive';

export const dynamic = 'force-dynamic';

export default async function PromptsPage() {
    const summary = await loadArchiveSummary();
    return <ArchiveConsole eyebrow="PROMPT CENTER" title="پرامپت‌ها" description="درخواست‌های برنامه‌ریزی و اجرا با شناسه و وضعیت پایدار." metric={{ label: 'پرامپت', value: summary.counts.prompts }} rows={summary.recentPrompts} kind="prompt" />;
}

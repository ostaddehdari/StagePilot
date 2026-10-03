import { ArchiveConsole } from '../../../components/archive-console';
import { loadArchiveSummary } from '../../../lib/archive';

export const dynamic = 'force-dynamic';

export default async function GitPage() {
    const summary = await loadArchiveSummary();
    return <ArchiveConsole eyebrow="GIT CONTROL" title="Git و GitHub" description="Commit، Push، SHA مقصد و خطاهای Git برای هر Work." metric={{ label: 'عملیات Git', value: summary.counts.git_operations }} rows={summary.recentGit} kind="git" />;
}

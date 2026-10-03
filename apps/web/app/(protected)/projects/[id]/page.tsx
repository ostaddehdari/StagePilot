import { notFound } from 'next/navigation';

import { ProjectControlCenter } from '../../../../components/project-control-center';
import { loadProjectControlCenter } from '../../../../lib/project-control';


export const dynamic = 'force-dynamic';


export default async function ProjectPage({
    params,
    searchParams
}: {
    params: Promise<{ id: string }>;
    searchParams: Promise<{ tab?: string }>;
}) {
    const [{ id }, query] = await Promise.all([params, searchParams]);
    const control = await loadProjectControlCenter(id);
    if (!control) notFound();
    return <ProjectControlCenter initial={control} initialTab={query.tab ?? 'workspace'} />;
}

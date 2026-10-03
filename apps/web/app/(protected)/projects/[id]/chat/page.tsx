import { redirect } from 'next/navigation';


export default async function LegacyProjectChatPage({
    params
}: {
    params: Promise<{ id: string }>;
}) {
    const { id } = await params;
    redirect(`/projects/${id}?tab=settings`);
}

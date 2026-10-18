import { loadWorkspace } from '@/lib/data';
import { Shell, Notice } from '@/components/shell';
import { Dashboard } from '@/components/dashboard';
export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  const [workspace, params] = await Promise.all([loadWorkspace(), searchParams]);
  return (
    <Shell profile={workspace.profile} preview={workspace.preview} current="/">
      <Notice {...params} />
      <Dashboard workspace={workspace} />
    </Shell>
  );
}

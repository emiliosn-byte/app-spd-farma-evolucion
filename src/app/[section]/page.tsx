import { notFound, redirect } from 'next/navigation';
import { loadWorkspace } from '@/lib/data';
import { Shell, Notice } from '@/components/shell';
import { Prospects, Patients, Sales } from '@/components/operations';
import { Finance } from '@/components/finance';
import { Settings, Account } from '@/components/settings';
export default async function Section({
  params,
  searchParams,
}: {
  params: Promise<{ section: string }>;
  searchParams: Promise<{ q?: string; month?: string; error?: string; success?: string }>;
}) {
  const [{ section }, query] = await Promise.all([params, searchParams]);
  if (!['interesados', 'pacientes', 'ventas', 'liquidaciones', 'configuracion', 'cuenta'].includes(section))
    notFound();
  const w = await loadWorkspace(section === 'cuenta');
  if (section === 'configuracion' && !w.manager) redirect('/');
  return (
    <Shell profile={w.profile} preview={w.preview} current={`/${section}`}>
      <Notice error={query.error} success={query.success} />
      {section === 'interesados' ? (
        <Prospects w={w} query={query.q} />
      ) : section === 'pacientes' ? (
        <Patients w={w} query={query.q} />
      ) : section === 'ventas' ? (
        <Sales w={w} selectedMonth={query.month} />
      ) : section === 'liquidaciones' ? (
        <Finance w={w} />
      ) : section === 'configuracion' ? (
        <Settings w={w} />
      ) : (
        <Account w={w} />
      )}
    </Shell>
  );
}

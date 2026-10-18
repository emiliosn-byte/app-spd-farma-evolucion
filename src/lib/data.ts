import 'server-only';
import { requireSession } from './session';
import type { RecordRow, Financial } from './types';
export const emptyFinancial: Financial = {
  accrued: 0,
  liquidable: 0,
  approved: 0,
  paid: 0,
  balances: [],
  entitlements: [],
};
export async function loadWorkspace(allowPasswordChange = false) {
  const session = await requireSession(allowPasswordChange);
  const manager = session.profile.role !== 'estandar';
  const names = [
    'employees',
    'patients',
    'patient_periods',
    'prospects',
    'sales',
    'monthly_reviews',
    'tasks',
    'employment_periods',
    ...(manager ? ['external_management', 'settlements', 'profiles'] : []),
  ];
  const data: Record<string, RecordRow[]> = {};
  if (!session.client || session.profile.must_change_password)
    names.forEach((n) => {
      data[n] = [];
    });
  else {
    await Promise.all(
      names.map(async (name) => {
        data[name] = await allRows(session.client!, name);
      }),
    );
  }
  let anchor: string | null = null,
    financial = emptyFinancial;
  if (session.client && !session.profile.must_change_password) {
    const [programme, summary] = await Promise.all([
      session.client.from('programme').select('start_month').eq('id', 1).single(),
      session.client.rpc('financial_summary'),
    ]);
    if (programme.error || summary.error)
      throw new Error('No se ha podido obtener el resumen. Compruebe las migraciones.');
    anchor = programme.data?.start_month ?? null;
    financial = summary.data as Financial;
  }
  return { ...session, data, anchor, financial, manager };
}
export async function allRows(
  client: NonNullable<Awaited<ReturnType<typeof requireSession>>['client']>,
  table: string,
) {
  const rows: RecordRow[] = [];
  for (let offset = 0; offset < 100000; offset += 500) {
    const { data, error } = await client
      .from(table)
      .select('*')
      .order('id')
      .range(offset, offset + 499);
    if (error) throw new Error('No se han podido cargar los datos. Compruebe la conexión y las migraciones.');
    rows.push(...((data ?? []) as RecordRow[]));
    if ((data?.length ?? 0) < 500) return rows;
  }
  throw new Error('La consulta supera el tamaño admitido. Contacte con el titular.');
}

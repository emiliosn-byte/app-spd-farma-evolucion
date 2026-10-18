import { requireSession } from '@/lib/session';
import { csv } from '@/lib/csv';
import { todayMadrid } from '@/lib/dates';
import { allRows } from '@/lib/data';
export async function GET(request: Request) {
  const { client, preview, profile } = await requireSession();
  if (preview || !client)
    return Response.json({ error: 'Conecta Supabase para exportar datos.' }, { status: 503 });
  const type = new URL(request.url).searchParams.get('type');
  const settlementId = new URL(request.url).searchParams.get('settlement');
  const headers = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' };
  if (type === 'full') {
    if (profile.role !== 'superpowers') return Response.json({ error: 'No autorizado' }, { status: 403 });
    const { data, error } = await client.rpc('export_administrative_data');
    if (error) return Response.json({ error: 'No se pudo exportar.' }, { status: 500 });
    return new Response(JSON.stringify(data, null, 2), {
      headers: {
        ...headers,
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="spd-datos-${todayMadrid()}.json"`,
      },
    });
  }
  if (!['employees', 'lines'].includes(type ?? ''))
    return Response.json({ error: 'Formato no válido' }, { status: 400 });
  const [summary, people] = await Promise.all([
    client.rpc('financial_summary'),
    allRows(client, 'employees'),
  ]);
  if (summary.error) return Response.json({ error: 'No se pudo exportar.' }, { status: 500 });
  const name = (id: string) => people.find((e) => e.id === id)?.name ?? id;
  let content: string;
  if (type === 'employees' && settlementId) {
    if (profile.role === 'estandar') return Response.json({ error: 'No autorizado' }, { status: 403 });
    if (!/^[0-9a-f-]{36}$/i.test(settlementId))
      return Response.json({ error: 'Liquidación no válida' }, { status: 400 });
    const { data: settlement, error } = await client
      .from('settlements')
      .select('period_start,period_end,status')
      .eq('id', settlementId)
      .single();
    if (error || !settlement || settlement.status === 'BORRADOR')
      return Response.json({ error: 'La liquidación debe estar aprobada' }, { status: 400 });
    const lines = (await allRows(client, 'settlement_lines')).filter((l) => l.settlement_id === settlementId);
    const totals = new Map<string, number>();
    for (const line of lines)
      totals.set(
        line.employee_id,
        (totals.get(line.employee_id) ?? 0) + Math.round(Number(line.amount) * 100),
      );
    content = csv([
      ['Periodo desde', 'Periodo hasta', 'Empleada', 'Importe aprobado neto EUR'],
      ...Array.from(totals, ([id, cents]) => [
        settlement.period_start,
        settlement.period_end,
        name(id),
        cents / 100,
      ]),
    ]);
  } else if (type === 'employees')
    content = csv([
      ['Empleada', 'Aprobado neto EUR', 'Pagado EUR', 'Saldo EUR'],
      ...summary.data.balances.map((b: any) => [
        name(b.employee_id),
        Number(b.approved),
        Number(b.paid),
        Number(b.outstanding),
      ]),
    ]);
  else {
    const [lines, patients] = await Promise.all([
      allRows(client, 'settlement_lines'),
      allRows(client, 'patients'),
    ]);
    content = csv([
      ['Liquidación', 'Código Farmatic', 'Empleada', 'Ciclo', 'Concepto', 'Importe neto EUR'],
      ...lines.map((l) => [
        l.settlement_id,
        patients.find((p) => p.id === l.patient_id)?.farmatic_code ?? '',
        name(l.employee_id),
        l.cycle,
        l.concept,
        Number(l.amount),
      ]),
    ]);
  }
  return new Response(content, {
    headers: {
      ...headers,
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="spd-${type}${settlementId ? '-trimestre' : ''}-${todayMadrid()}.csv"`,
    },
  });
}

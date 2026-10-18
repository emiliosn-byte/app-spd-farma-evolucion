import { Download, Wallet, ShieldCheck } from 'lucide-react';
import { PageHeader, Empty, Badge } from './shell';
import { Input, Hidden } from './forms';
import { createSettlementAction, approveAction, paymentAction } from '@/app/actions';
import { euros, formatDate, monthLabel, todayMadrid, addMonths } from '@/lib/dates';
import type { Preview } from '@/lib/types';
import type { loadWorkspace } from '@/lib/data';
type Workspace = Awaited<ReturnType<typeof loadWorkspace>>;
export async function Finance({ w }: { w: Workspace }) {
  const settlements = [...(w.data.settlements ?? [])].sort((a, b) =>
    b.period_start.localeCompare(a.period_start),
  );
  const previews = new Map<string, Preview>();
  if (w.client && w.manager)
    for (const s of settlements) {
      const { data, error } = await w.client.rpc('settlement_preview', { p_id: s.id });
      if (error) throw new Error('No se pudo obtener el detalle económico');
      previews.set(s.id, data as Preview);
    }
  const quarters: { value: string; label: string }[] = [];
  if (w.anchor) {
    const now = todayMadrid();
    for (let i = 0; i < 80; i++) {
      const start = addMonths(w.anchor, i * 3);
      if (start > now) break;
      quarters.push({
        value: start,
        label: `T${i + 1} · ${monthLabel(start)} — ${monthLabel(addMonths(start, 2))}`,
      });
    }
  }
  const name = (id: string) => w.data.employees.find((e) => e.id === id)?.name ?? 'Empleada';
  const code = (id: string) => w.data.patients.find((p) => p.id === id)?.farmatic_code ?? '—';
  return (
    <>
      <PageHeader
        eyebrow="RECONOCER CADA APORTACIÓN"
        title={w.manager ? 'Incentivos claros. Pagos trazables.' : 'Tu trabajo, reconocido.'}
        description={
          w.manager
            ? 'Prepara, revisa y conserva cada liquidación. Solo superpowers aprueba y confirma pagos.'
            : 'Consulta tus incentivos generados, los importes aprobados y los pagos registrados.'
        }
      >
        {!w.preview && (
          <a href="/api/export?type=employees" className="button secondary">
            <Download size={16} /> CSV por empleada
          </a>
        )}
      </PageHeader>
      <div className="stat-grid">
        {[
          { label: 'Acumulado', value: w.financial.accrued, note: 'Derechos generados, antes de liquidar' },
          {
            label: 'Liquidable',
            value: w.financial.liquidable,
            note: 'Pendiente de aprobar, incluidos ajustes',
          },
          { label: 'Aprobado', value: w.financial.approved, note: 'Total histórico, incluidos ajustes' },
          { label: 'Pagado', value: w.financial.paid, note: 'Pagos confirmados' },
        ].map((c) => (
          <div className="stat-card" key={c.label}>
            <div className="stat-top">
              {c.label}
              <Wallet size={17} />
            </div>
            <strong className="stat-value">{euros(c.value)}</strong>
            <span className="stat-note">{c.note}</span>
          </div>
        ))}
      </div>
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Saldos por empleada</h2>
            <p>Saldo = aprobado − pagado. Los ajustes negativos se compensan con derechos posteriores.</p>
          </div>
        </div>
        {w.financial.balances.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Empleada</th>
                  <th>Aprobado</th>
                  <th>Pagado</th>
                  <th>Saldo</th>
                  {w.profile.role === 'superpowers' && <th>Registrar pago</th>}
                </tr>
              </thead>
              <tbody>
                {w.financial.balances.map((b) => (
                  <tr key={b.employee_id}>
                    <td>{name(b.employee_id)}</td>
                    <td>{euros(b.approved)}</td>
                    <td>{euros(b.paid)}</td>
                    <td className="amount">
                      {euros(b.outstanding)}
                      {Number(b.outstanding) < 0 && <small>A compensar en próximos incentivos</small>}
                    </td>
                    {w.profile.role === 'superpowers' && (
                      <td>
                        {Number(b.outstanding) > 0 ? (
                          <details className="editor">
                            <summary>Confirmar pago</summary>
                            <form action={paymentAction} className="record-form editor-body">
                              <Hidden path="/liquidaciones" />
                              <input type="hidden" name="settlement_id" value={b.latest_settlement} />
                              <input type="hidden" name="employee_id" value={b.employee_id} />
                              <p>
                                Registrar el pago del saldo completo: <strong>{euros(b.outstanding)}</strong>.
                                No se ejecutará ninguna transferencia.
                              </p>
                              <Input
                                field={{
                                  name: 'paid_on',
                                  label: 'Fecha real del pago',
                                  type: 'date',
                                  required: true,
                                  max: todayMadrid(),
                                }}
                              />
                              <Input
                                field={{ name: 'reference', label: 'Referencia administrativa (opcional)' }}
                              />
                              <button className="button primary" disabled={w.preview}>
                                Confirmar pago realizado
                              </button>
                            </form>
                          </details>
                        ) : (
                          <Badge tone="green">Sin pago pendiente</Badge>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty
            title="Cada incentivo tendrá su detalle"
            description="Aquí aparecerán los saldos cuando exista una liquidación aprobada."
            icon={Wallet}
          />
        )}
      </section>
      {w.manager && (
        <>
          <section className="panel form-panel">
            <div className="panel-heading">
              <div>
                <h2>Preparar una liquidación trimestral</h2>
                <p>La vista previa incluye derechos nuevos y ajustes de periodos anteriores.</p>
              </div>
              <ShieldCheck size={22} />
            </div>
            <form action={createSettlementAction} className="inline-form">
              <Hidden path="/liquidaciones" />
              <Input
                field={{
                  name: 'period_start',
                  label: 'Trimestre del programa',
                  type: 'select',
                  required: true,
                  options: quarters,
                }}
              />
              <button className="button primary" disabled={w.preview || !w.anchor}>
                Preparar borrador
              </button>
            </form>
            {!w.anchor && (
              <p className="muted">El calendario de liquidaciones se activará con la primera venta.</p>
            )}
          </section>
          <section className="panel">
            <div className="panel-heading">
              <div>
                <h2>Historial de liquidaciones</h2>
                <p>Los trimestres abiertos pueden revisarse; la aprobación espera al cierre del periodo.</p>
              </div>
              {!w.preview && (
                <a className="text-link" href="/api/export?type=lines">
                  <Download size={15} /> Detalle interno CSV
                </a>
              )}
            </div>
            {settlements.length ? (
              settlements.map((s) => {
                const preview = previews.get(s.id);
                return (
                  <details className="settlement-details" key={s.id} open={s.status === 'BORRADOR'}>
                    <summary>
                      <span>
                        <strong>
                          {formatDate(s.period_start)} — {formatDate(s.period_end)}
                        </strong>
                        <small>
                          {s.approved_at
                            ? `Aprobada el ${formatDate(s.approved_at)}`
                            : 'Pendiente de revisión y aprobación'}
                        </small>
                      </span>
                      <Badge tone={s.status === 'BORRADOR' ? 'amber' : 'green'}>{s.status}</Badge>
                    </summary>
                    <div className="settlement-content">
                      {s.status !== 'BORRADOR' && !w.preview && (
                        <a href={`/api/export?type=employees&settlement=${s.id}`} className="text-link">
                          <Download size={15} /> CSV del trimestre por empleada
                        </a>
                      )}
                      {Boolean(preview?.blockers.length) && (
                        <div className="notice warning">
                          <strong>Hay comprobaciones necesarias antes de aprobar.</strong>
                          <ul>
                            {preview!.blockers.map((b, i) => (
                              <li key={i}>
                                {b.code === 'MES_PENDIENTE'
                                  ? 'Mes pendiente'
                                  : b.code === 'CLASIFICACION'
                                    ? 'Clasificación sin validar'
                                    : b.code === 'EQUIPO_INCOMPLETO'
                                      ? 'Equipo inicial incompleto'
                                      : 'Jornada sin beneficiarias'}{' '}
                                · {b.detail}
                                {b.month ? ` · ${monthLabel(b.month)}` : ''}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {preview?.lines.length ? (
                        <div className="table-scroll">
                          <table>
                            <thead>
                              <tr>
                                <th>Paciente</th>
                                <th>Empleada</th>
                                <th>Ciclo</th>
                                <th>Concepto</th>
                                <th>Importe neto</th>
                              </tr>
                            </thead>
                            <tbody>
                              {preview.lines.map((l, i) => (
                                <tr key={i}>
                                  <td className="code">{code(l.patient_id)}</td>
                                  <td>{name(l.employee_id)}</td>
                                  <td>{l.cycle}</td>
                                  <td>
                                    {l.concept}
                                    {Number(l.amount) < 0 && <small>Ajuste respecto a lo aprobado</small>}
                                  </td>
                                  <td className="amount">{euros(l.amount)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <p className="muted">
                          No hay nuevos importes liquidables ni ajustes para este periodo.
                        </p>
                      )}
                      {s.status === 'BORRADOR' && w.profile.role === 'superpowers' && preview && (
                        <form action={approveAction} className="approve-form">
                          <Hidden path="/liquidaciones" id={s.id} />
                          <input type="hidden" name="signature" value={preview.signature} />
                          <p>
                            La aprobación conservará los datos y repartos utilizados. Los cambios posteriores
                            se registrarán como ajustes.
                          </p>
                          <button
                            className="button primary"
                            disabled={
                              w.preview || preview.blockers.length > 0 || s.period_end >= todayMadrid()
                            }
                          >
                            Aprobar liquidación
                          </button>
                        </form>
                      )}
                    </div>
                  </details>
                );
              })
            ) : (
              <Empty
                title="Todavía no hay liquidaciones"
                description="Prepara el primer borrador para revisar los importes por paciente y empleada."
                icon={Wallet}
              />
            )}
          </section>
        </>
      )}
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Detalle de incentivos acumulados</h2>
            <p>
              La captación exige tres meses con compra en el primer ciclo. Permanencia y mantenimiento maduran
              al cierre.
            </p>
          </div>
        </div>
        {w.financial.entitlements.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Paciente</th>
                  <th>Empleada</th>
                  <th>Ciclo</th>
                  <th>Concepto</th>
                  <th>Acumulado</th>
                </tr>
              </thead>
              <tbody>
                {w.financial.entitlements.map((r, i) => (
                  <tr key={i}>
                    <td className="code">{code(r.patient_id)}</td>
                    <td>{name(r.employee_id)}</td>
                    <td>{r.cycle}</td>
                    <td>{r.concept}</td>
                    <td className="amount">{euros(r.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty
            title="Los primeros incentivos están por llegar"
            description="Al confirmar los meses de compra, cada derecho aparecerá aquí con su concepto y ciclo."
            icon={Wallet}
          />
        )}
        <div className="calculation-note">
          <strong>Cómo se calcula</strong>
          <p>
            Captación: 40 € NUEVO / 15 € PROPIO al alcanzar tres meses con compra. Permanencia inicial: máximo
            × (meses con compra − 3) / 9. Mantenimiento posterior: importe anual × meses con compra / 12.
          </p>
          <p>
            Mostrador: cada tramo mensual se reparte según las jornadas y los días de participación de ese
            mes. Externa: íntegro para la captadora mientras corresponda. Titular: sin incentivo. El objetivo
            colectivo no condiciona el cobro.
          </p>
        </div>
      </section>
    </>
  );
}

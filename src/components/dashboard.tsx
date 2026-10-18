import Link from 'next/link';
import {
  ArrowUpRight,
  ArrowRight,
  UsersRound,
  Target,
  CalendarCheck2,
  Wallet,
  Plus,
  TrendingUp,
  Sprout,
  Flag,
} from 'lucide-react';
import { PageHeader, Empty, Badge } from './shell';
import { euros, formatDate, monthLabel, todayMadrid } from '@/lib/dates';
import { objectiveSummary, monthlyEvolution, targets } from '@/lib/objectives';
import { Evolution } from './evolution';
import type { loadWorkspace } from '@/lib/data';
type Workspace = Awaited<ReturnType<typeof loadWorkspace>>;
export function Dashboard({ workspace: w }: { workspace: Workspace }) {
  const { patients, patient_periods: periods, tasks, employees } = w.data;
  const summary = objectiveSummary(w.anchor, patients as any, periods as any);
  const pending = [
    ...tasks.filter((t) => !t.done),
    ...w.data.prospects
      .filter((p) => p.next_action_on && !['CONVERTIDO', 'DESCARTADO'].includes(p.status))
      .map((p) => ({
        ...p,
        due_on: p.next_action_on,
        assignee_id: p.captor_id,
        action: `Contactar · ${p.reference}`,
      })),
  ].sort((a, b) => a.due_on.localeCompare(b.due_on));
  const q = summary.current;
  const cards = [
    {
      label: 'Pacientes activos',
      value: String(summary.active),
      note: 'Cada incorporación cuenta',
      icon: UsersRound,
      tone: 'green',
    },
    {
      label: 'Objetivo del trimestre',
      value: q ? `${q.real} / ${q.total}` : '— / 12',
      note: q ? `${q.remaining} altas para alcanzar la meta` : 'Se activa con la primera venta',
      icon: Target,
      tone: 'teal',
    },
    {
      label: 'Acciones pendientes',
      value: String(pending.length),
      note: pending.length
        ? `${pending.filter((t) => t.due_on < todayMadrid()).length} fuera de fecha`
        : 'El seguimiento está al día',
      icon: CalendarCheck2,
      tone: 'amber',
    },
    {
      label: w.manager ? 'Incentivos acumulados' : 'Mis incentivos acumulados',
      value: euros(w.financial.accrued),
      note: 'Total generado, incluido lo pagado',
      icon: Wallet,
      tone: 'violet',
    },
  ];
  return (
    <>
      <PageHeader
        eyebrow="CUIDAMOS EL PRESENTE. CONSTRUIMOS CONTINUIDAD."
        title="Tu SPD, de un vistazo."
        description="Pacientes, objetivos y equipo. Todo lo que necesitas para seguir avanzando."
      >
        <Link href="/ventas#nueva-venta" className="button secondary">
          <Plus size={16} /> Registrar venta
        </Link>
        <Link href="/pacientes#nuevo-paciente" className="button primary">
          <Plus size={16} /> Nuevo paciente
        </Link>
      </PageHeader>
      <div className="stat-grid">
        {cards.map((c) => (
          <div className="stat-card" key={c.label}>
            <div className="stat-top">
              <span>{c.label}</span>
              <span className={`stat-icon ${c.tone}`}>
                <c.icon size={19} />
              </span>
            </div>
            <strong className="stat-value">{c.value}</strong>
            <span className="stat-note">{c.note}</span>
          </div>
        ))}
      </div>
      <div className="dashboard-main">
        <section className="panel objective-panel">
          <div className="panel-heading">
            <div>
              <div className="eyebrow">UN OBJETIVO COMPARTIDO</div>
              <h2>{q ? `Así va el trimestre ${q.index + 1}` : 'El primer paso empieza aquí'}</h2>
            </div>
            <Badge tone={w.anchor ? 'green' : 'neutral'}>
              {w.anchor ? 'Programa en marcha' : 'Pendiente de inicio'}
            </Badge>
          </div>
          {q ? (
            <>
              <div className="objective-number">
                <strong>
                  {q.real}
                  <small> / {q.total}</small>
                </strong>
                <span>
                  incorporaciones
                  <br />
                  este trimestre
                </span>
                <b>{Math.round(q.percentage)} %</b>
              </div>
              <div className="progress-track">
                <span style={{ width: `${Math.min(q.percentage, 100)}%` }} />
              </div>
              <div className="objective-split">
                <div>
                  <span className="legend-dot teal" />
                  Nuevos
                  <strong>
                    {q.realNuevo} <small>/ {q.nuevo}</small>
                  </strong>
                </div>
                <div>
                  <span className="legend-dot mint" />
                  Propios
                  <strong>
                    {q.realPropio} <small>/ {q.propio}</small>
                  </strong>
                </div>
              </div>
              <div className="pace-note">
                <TrendingUp size={18} />
                <span>
                  Referencia a fecha de hoy: <strong>{q.expected.toFixed(1)} altas</strong>. Quedan{' '}
                  {q.remainingDays} días y {q.remaining} altas para la meta.
                  {q.remaining > 0 && q.remainingDays > 0
                    ? ` Ritmo necesario: ${((q.remaining / q.remainingDays) * 30).toFixed(1)} altas al mes.`
                    : ' Objetivo alcanzado.'}
                </span>
              </div>
            </>
          ) : (
            <div className="programme-empty">
              <div className="growth-illustration">
                <span />
                <Sprout size={56} strokeWidth={1.2} />
                <i />
                <b />
              </div>
              <h3>{w.anchor ? 'Seguimos hacia los 100 pacientes' : 'Todo empieza con la primera venta'}</h3>
              <p>
                {w.anchor
                  ? 'El segundo año mantiene la meta de pacientes activos. No hay objetivos trimestrales definidos para este año.'
                  : 'En cuanto registres la primera venta, activaremos los 12 meses del programa y sus objetivos trimestrales.'}
              </p>
              <Link href="/ventas#nueva-venta" className="text-link">
                Registrar una venta <ArrowRight size={16} />
              </Link>
            </div>
          )}
          <div className="programme-calendar">
            <span>
              Inicio del programa
              <strong>{w.anchor ? monthLabel(w.anchor) : 'Primera venta pendiente'}</strong>
            </span>
            <span>
              Calendario<strong>12 meses desde el inicio</strong>
            </span>
          </div>
        </section>
        <section className="vision-card">
          <div className="vision-top">
            <span className="vision-icon">
              <Flag size={21} />
            </span>
            <span>HORIZONTE A DOS AÑOS</span>
          </div>
          <h2>
            Más continuidad.
            <br />
            Más personas
            <br />
            <em>bien cuidadas.</em>
          </h2>
          <div className="vision-number">
            {summary.active}
            <span>/ 100</span>
          </div>
          <p>pacientes activos es nuestra meta colectiva</p>
          <div className="vision-track">
            <span style={{ width: `${Math.min(summary.active, 100)}%` }} />
          </div>
          <div className="vision-footer">
            <span>
              {summary.deadline
                ? `Hasta ${formatDate(new Date(Date.parse(summary.deadline) - 86400000).toISOString().slice(0, 10))}`
                : '24 meses desde la primera venta'}
            </span>
            <ArrowUpRight size={19} />
          </div>
        </section>
      </div>
      <section className="panel quarters-panel">
        <div className="panel-heading">
          <div>
            <h2>Una hoja de ruta para el primer año</h2>
            <p>Metas de incorporaciones. Las bajas se reflejan por separado en pacientes activos.</p>
          </div>
          <span className="subtle-label">NUEVOS + PROPIOS</span>
        </div>
        <div className="quarter-grid">
          {targets.map((target, i) => {
            const real = summary.quarters[i];
            return (
              <div className={`quarter-card ${q?.index === i ? 'current' : ''}`} key={i}>
                <div className="quarter-title">
                  <span>Trimestre {i + 1}</span>
                  {q?.index === i ? (
                    <Badge tone="green">Actual</Badge>
                  ) : (
                    <span className="quarter-index">0{i + 1}</span>
                  )}
                </div>
                <span className="quarter-dates">
                  {real
                    ? `${monthLabel(real.start)} — ${monthLabel(new Date(Date.parse(real.endExclusive) - 86400000).toISOString().slice(0, 10))}`
                    : 'Fechas pendientes de inicio'}
                </span>
                <div className="quarter-total">
                  {real?.real ?? 0}
                  <small> / {target.total} altas</small>
                </div>
                <div className="progress-track small">
                  <span style={{ width: `${Math.min(real?.percentage ?? 0, 100)}%` }} />
                </div>
                <span className="quarter-breakdown">
                  {target.nuevo} nuevos <i /> {target.propio} propios
                </span>
              </div>
            );
          })}
        </div>
      </section>
      <Evolution series={monthlyEvolution(w.anchor, patients as any, periods as any)} />
      <div className="dashboard-bottom">
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Lo próximo en tu agenda</h2>
              <p>Pequeñas acciones que dan continuidad al cuidado.</p>
            </div>
            <Link className="text-link" href="/pacientes#seguimientos">
              Ver seguimiento <ArrowUpRight size={15} />
            </Link>
          </div>
          {pending.length ? (
            <div className="task-list">
              {pending.slice(0, 4).map((t) => (
                <div key={t.id}>
                  <span className="task-circle" />
                  <div>
                    <strong>{String(t.action).toLowerCase().replaceAll('_', ' ')}</strong>
                    <small>
                      {employees.find((e) => e.id === t.assignee_id)?.name ?? 'Sin responsable'} ·{' '}
                      {formatDate(t.due_on)}
                    </small>
                  </div>
                  <Badge tone={t.due_on < todayMadrid() ? 'amber' : 'neutral'}>
                    {t.due_on < todayMadrid() ? 'Pendiente' : 'Programada'}
                  </Badge>
                </div>
              ))}
            </div>
          ) : (
            <Empty
              title="Un comienzo con todo por hacer"
              description="Añade tus primeros pacientes y organiza aquí las próximas acciones."
              icon={CalendarCheck2}
            />
          )}
        </section>
        <section className="panel money-panel">
          <div className="panel-heading">
            <div>
              <h2>{w.manager ? 'El reconocimiento al equipo' : 'Tu reconocimiento'}</h2>
              <p>Cada importe, en su momento.</p>
            </div>
            <Wallet size={20} />
          </div>
          <div className="money-row">
            <span>
              Liquidable <small>Pendiente de aprobar, incluidos ajustes</small>
            </span>
            <strong>{euros(w.financial.liquidable)}</strong>
          </div>
          <div className="money-row">
            <span>
              Aprobado <small>Incluye ajustes identificados</small>
            </span>
            <strong>{euros(w.financial.approved)}</strong>
          </div>
          <div className="money-row">
            <span>
              Pagado <small>Pagos confirmados</small>
            </span>
            <strong>{euros(w.financial.paid)}</strong>
          </div>
          <Link href="/liquidaciones" className="money-link">
            Consultar el detalle <ArrowRight size={17} />
          </Link>
        </section>
      </div>
    </>
  );
}

import { Empty } from './shell';
import { monthlyEvolution } from '@/lib/objectives';
import { monthLabel } from '@/lib/dates';
export function Evolution({ series }: { series: ReturnType<typeof monthlyEvolution> }) {
  const max = Math.max(1, ...series.flatMap((m) => [m.incorporations, m.departures]));
  return (
    <section className="panel evolution-panel">
      <div className="panel-heading">
        <div>
          <h2>Cómo evoluciona el servicio</h2>
          <p>
            Incorporaciones y bajas por mes. Las reactivaciones recuperan activos, sin sumar nuevas altas al
            objetivo.
          </p>
        </div>
        <div className="chart-legend">
          <span>
            <i /> Altas
          </span>
          <span>
            <i /> Bajas
          </span>
        </div>
      </div>
      {series.length ? (
        <>
          <div
            className="evolution-chart"
            role="img"
            aria-label="Evolución mensual de altas y bajas; detalle numérico disponible debajo"
          >
            {series.map((m) => (
              <div
                className={`evolution-month ${m.future ? 'future' : ''}`}
                key={m.month}
                title={`${monthLabel(m.month)}: ${m.incorporations} altas, ${m.departures} bajas, ${m.reactivations} reactivaciones; ${m.active ?? 'pendiente'} activos`}
              >
                <div className="evolution-bars">
                  <span style={{ height: `${Math.max(2, (m.incorporations / max) * 100)}%` }} />
                  <span style={{ height: `${Math.max(2, (m.departures / max) * 100)}%` }} />
                </div>
                <strong>
                  {new Intl.DateTimeFormat('es-ES', { month: 'short', timeZone: 'UTC' })
                    .format(new Date(`${m.month}T12:00:00Z`))
                    .replace('.', '')}
                </strong>
                <small>{m.future ? 'Pendiente' : `${m.active} act.`}</small>
              </div>
            ))}
          </div>
          <details className="editor">
            <summary>Ver datos mensuales</summary>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Mes</th>
                    <th>Altas nuevas</th>
                    <th>Bajas</th>
                    <th>Reactivaciones</th>
                    <th>Activos al cierre o a fecha de hoy</th>
                  </tr>
                </thead>
                <tbody>
                  {series.map((m) => (
                    <tr key={m.month}>
                      <td>{monthLabel(m.month)}</td>
                      <td>{m.future ? '—' : m.incorporations}</td>
                      <td>{m.future ? '—' : m.departures}</td>
                      <td>{m.future ? '—' : m.reactivations}</td>
                      <td>{m.active ?? 'Pendiente'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </>
      ) : (
        <Empty
          title="La evolución se dibujará con datos reales"
          description="Desde la primera venta verás las altas, bajas y pacientes activos de cada mes."
        />
      )}
    </section>
  );
}

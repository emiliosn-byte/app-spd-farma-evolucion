import Link from 'next/link';
import { Plus, UsersRound, ShoppingBag, ArrowUpRight, CheckCheck } from 'lucide-react';
import { PageHeader, Empty, Badge } from './shell';
import {
  ResourceForm,
  Input,
  Editor,
  Hidden,
  employeeOptions,
  patientOptions,
  kindOptions,
  originOptions,
  taskFields,
  type Field,
} from './forms';
import { convertAction, statusAction, saveAction } from '@/app/actions';
import { formatDate, todayMadrid, monthLabel, addMonths } from '@/lib/dates';
import type { loadWorkspace } from '@/lib/data';
type Workspace = Awaited<ReturnType<typeof loadWorkspace>>;
export function Prospects({ w, query = '' }: { w: Workspace; query?: string }) {
  const rows = w.data.prospects
    .filter((r) => r.reference.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  const fields: Field[] = [
    { name: 'captor_id', label: 'Captadora', type: 'select', options: employeeOptions(w.data.employees) },
    { name: 'origin', label: 'Origen', type: 'select', required: true, options: originOptions },
    {
      name: 'status',
      label: 'Estado',
      type: 'select',
      required: true,
      options: ['INTERESADO', 'CONTACTADO', 'DESCARTADO'].map((value) => ({
        value,
        label: value.toLowerCase(),
      })),
    },
    { name: 'next_action_on', label: 'Próxima acción', type: 'date' },
  ];
  return (
    <>
      <PageHeader
        eyebrow="EL COMIENZO DEL SEGUIMIENTO"
        title="De interés a continuidad."
        description="Organiza las oportunidades de incorporación al servicio, sin datos clínicos ni identificativos."
      >
        <a href="#nuevo-interesado" className="button primary">
          <Plus size={16} /> Nuevo interesado
        </a>
      </PageHeader>
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>
              Interesados <span className="count">{rows.length}</span>
            </h2>
            <p>Referencias temporales hasta la incorporación a Farmatic.</p>
          </div>
          <form className="search-form">
            <input
              name="q"
              aria-label="Buscar referencia"
              placeholder="Buscar referencia…"
              defaultValue={query}
            />
            <button className="button secondary">Buscar</button>
          </form>
        </div>
        {rows.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Referencia</th>
                  <th>Captadora / origen</th>
                  <th>Próxima acción</th>
                  <th>Estado</th>
                  <th>Gestión</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="code">{r.reference}</td>
                    <td>
                      {w.data.employees.find((e) => e.id === r.captor_id)?.name ?? 'Sin asignar'}
                      <small>{r.origin}</small>
                    </td>
                    <td>{formatDate(r.next_action_on)}</td>
                    <td>
                      <Badge tone={r.status === 'CONVERTIDO' ? 'green' : 'neutral'}>{r.status}</Badge>
                    </td>
                    <td>
                      {r.status === 'CONVERTIDO' ? (
                        <Link href="/pacientes" className="text-link">
                          Ver pacientes <ArrowUpRight size={14} />
                        </Link>
                      ) : (
                        <>
                          <Editor>
                            <ResourceForm
                              resource="prospects"
                              path="/interesados"
                              fields={fields}
                              record={r}
                              disabled={w.preview}
                            />
                          </Editor>
                          <Editor label="Incorporar al SPD">
                            <form action={convertAction} className="record-form">
                              <Hidden path="/interesados" id={r.id} version={r.version} />
                              <div className="form-grid">
                                <Input
                                  field={{
                                    name: 'farmatic_code',
                                    label: 'Código de Farmatic',
                                    required: true,
                                  }}
                                />
                                <Input
                                  field={{
                                    name: 'joined_on',
                                    label: 'Fecha real de alta',
                                    type: 'date',
                                    max: todayMadrid(),
                                    required: true,
                                  }}
                                />
                                <Input
                                  field={{
                                    name: 'kind',
                                    label: 'Clasificación',
                                    type: 'select',
                                    options: kindOptions,
                                    required: true,
                                  }}
                                />
                              </div>
                              <button className="button primary" disabled={w.preview}>
                                Convertir conservando el historial
                              </button>
                            </form>
                          </Editor>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty
            title="Las primeras oportunidades empiezan aquí"
            description="Crea una referencia para organizar la captación y la próxima acción."
            icon={UsersRound}
          />
        )}
      </section>
      <section className="panel form-panel" id="nuevo-interesado">
        <div className="panel-heading">
          <div>
            <h2>Nuevo interesado</h2>
            <p>La referencia temporal se generará automáticamente.</p>
          </div>
        </div>
        <ResourceForm
          resource="prospects"
          path="/interesados"
          fields={fields}
          defaults={{ origin: 'MOSTRADOR', status: 'INTERESADO' }}
          disabled={w.preview}
          label="Crear interesado"
        />
      </section>
    </>
  );
}
export function Patients({ w, query = '' }: { w: Workspace; query?: string }) {
  const { patients, employees, patient_periods: periods, sales, tasks, prospects } = w.data;
  const rows = patients
    .filter((p) => p.farmatic_code.includes(query))
    .sort((a, b) => b.joined_on.localeCompare(a.joined_on));
  const fields: Field[] = [
    {
      name: 'farmatic_code',
      label: 'Código Farmatic',
      required: true,
      hint: 'Se conservarán los ceros iniciales.',
    },
    { name: 'joined_on', label: 'Fecha real de alta', type: 'date', required: true, max: todayMadrid() },
    { name: 'kind', label: 'Clasificación', type: 'select', required: true, options: kindOptions },
    { name: 'origin', label: 'Origen', type: 'select', required: true, options: originOptions },
    {
      name: 'captor_id',
      label: 'Captadora',
      type: 'select',
      options: employeeOptions(employees),
      hint: 'Obligatoria para captación externa.',
    },
    {
      name: 'followup_id',
      label: 'Responsable del seguimiento',
      type: 'select',
      options: employeeOptions(employees),
    },
    ...(w.manager
      ? [{ name: 'validated', label: 'Clasificación y origen revisados', type: 'checkbox' as const }]
      : []),
  ];
  return (
    <>
      <PageHeader
        eyebrow="EL CENTRO DE NUESTRO SERVICIO"
        title="Cada paciente, con seguimiento."
        description="Altas, continuidad y acciones administrativas vinculadas al código de Farmatic."
      >
        <a href="#nuevo-paciente" className="button primary">
          <Plus size={16} /> Nuevo paciente
        </a>
      </PageHeader>
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>
              Pacientes <span className="count">{rows.length}</span>
            </h2>
            <p>La identidad y los tratamientos se consultan en Farmatic.</p>
          </div>
          <form className="search-form">
            <input
              name="q"
              aria-label="Buscar código Farmatic"
              inputMode="numeric"
              placeholder="Código Farmatic…"
              defaultValue={query}
            />
            <button className="button secondary">Buscar</button>
          </form>
        </div>
        {rows.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Código Farmatic</th>
                  <th>Alta y clasificación</th>
                  <th>Origen / captadora</th>
                  <th>Continuidad</th>
                  <th>Gestión</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => {
                  const active = periods.some(
                    (s) =>
                      s.patient_id === p.id &&
                      s.starts_on <= todayMadrid() &&
                      (!s.ends_on || s.ends_on >= todayMadrid()),
                  );
                  const buys = new Set(
                    sales.filter((s) => s.patient_id === p.id && !s.voided).map((s) => s.sold_on.slice(0, 7)),
                  ).size;
                  return (
                    <tr key={p.id}>
                      <td className="code">
                        {p.farmatic_code}
                        <small>{p.validated ? 'Datos validados' : 'Pendiente de validar'}</small>
                      </td>
                      <td>
                        {formatDate(p.joined_on)}
                        <small>{p.kind}</small>
                      </td>
                      <td>
                        {p.origin}
                        <small>{employees.find((e) => e.id === p.captor_id)?.name ?? '—'}</small>
                      </td>
                      <td>
                        <Badge tone={active ? 'green' : 'neutral'}>{active ? 'Activo' : 'De baja'}</Badge>
                        <small>{buys} meses con compra registrados</small>
                      </td>
                      <td>
                        <Editor>
                          <ResourceForm
                            resource="patients"
                            path="/pacientes"
                            fields={fields.map((f) => ({
                              ...f,
                              readOnly: f.name === 'joined_on' && !w.manager,
                            }))}
                            record={p}
                            disabled={w.preview}
                          />
                        </Editor>
                        <Editor label="Actividad e historial">
                          <div className="history-list">
                            {periods
                              .filter((s) => s.patient_id === p.id)
                              .sort((a, b) => a.starts_on.localeCompare(b.starts_on))
                              .map((s) => (
                                <p key={s.id}>
                                  {formatDate(s.starts_on)} →{' '}
                                  {s.ends_on ? formatDate(s.ends_on) : 'En activo'}
                                </p>
                              ))}
                          </div>
                          <form action={statusAction} className="record-form">
                            <Hidden path="/pacientes" id={p.id} version={p.version} />
                            <input type="hidden" name="active" value={active ? 'false' : 'true'} />
                            <Input
                              field={{
                                name: 'effective_on',
                                label: active ? 'Fecha efectiva de baja' : 'Fecha de reactivación',
                                type: 'date',
                                required: true,
                                max: todayMadrid(),
                              }}
                            />
                            <button className="button secondary" disabled={w.preview}>
                              {active ? 'Registrar baja' : 'Reactivar sin repetir captación'}
                            </button>
                          </form>
                        </Editor>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty
            title="Preparados para el primer paciente"
            description="Registra el código de Farmatic y la fecha real de incorporación para empezar."
          />
        )}
      </section>
      <section className="panel form-panel" id="nuevo-paciente">
        <div className="panel-heading">
          <div>
            <h2>Nuevo paciente</h2>
            <p>El ciclo individual abarca doce meses de calendario desde su mes de alta.</p>
          </div>
        </div>
        <ResourceForm
          resource="patients"
          path="/pacientes"
          fields={fields}
          defaults={{ kind: 'NUEVO', origin: 'MOSTRADOR', validated: false }}
          disabled={w.preview}
          label="Incorporar paciente"
        />
      </section>
      <section className="panel" id="seguimientos">
        <div className="panel-heading">
          <div>
            <h2>Seguimiento administrativo</h2>
            <p>Acciones, responsables y fechas. Sin notas clínicas.</p>
          </div>
        </div>
        {tasks.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Referencia</th>
                  <th>Acción / responsable</th>
                  <th>Fecha</th>
                  <th>Estado</th>
                  <th>Gestión</th>
                </tr>
              </thead>
              <tbody>
                {tasks
                  .sort((a, b) => a.due_on.localeCompare(b.due_on))
                  .map((t) => (
                    <tr key={t.id}>
                      <td className="code">
                        {patients.find((p) => p.id === t.patient_id)?.farmatic_code ??
                          prospects.find((p) => p.id === t.prospect_id)?.reference}
                      </td>
                      <td>
                        {t.action.replaceAll('_', ' ')}
                        <small>{employees.find((e) => e.id === t.assignee_id)?.name ?? 'Sin asignar'}</small>
                      </td>
                      <td>{formatDate(t.due_on)}</td>
                      <td>
                        <Badge tone={t.done ? 'green' : t.due_on < todayMadrid() ? 'amber' : 'neutral'}>
                          {t.done ? 'Completada' : 'Pendiente'}
                        </Badge>
                      </td>
                      <td>
                        <Editor>
                          <ResourceForm
                            resource="tasks"
                            path="/pacientes"
                            fields={taskFields(employees, patients, prospects)}
                            record={t}
                            disabled={w.preview}
                          />
                        </Editor>
                        {!t.done && (
                          <form action={saveAction}>
                            <Hidden path="/pacientes" id={t.id} version={t.version} />
                            <input type="hidden" name="resource" value="tasks" />
                            <input type="hidden" name="done" value="true" />
                            <button className="text-link" disabled={w.preview}>
                              <CheckCheck size={15} /> Completar
                            </button>
                          </form>
                        )}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty
            title="Una agenda para dar continuidad"
            description="Programa las próximas comprobaciones y contactos con tu equipo."
          />
        )}
        <Editor label="Programar una acción">
          <ResourceForm
            resource="tasks"
            path="/pacientes"
            fields={taskFields(employees, patients, prospects)}
            defaults={{ action: 'SEGUIMIENTO_ADMINISTRATIVO', done: false }}
            disabled={w.preview}
          />
        </Editor>
      </section>
    </>
  );
}
export function Sales({ w, selectedMonth }: { w: Workspace; selectedMonth?: string }) {
  const selected =
    selectedMonth && /^\d{4}-(0[1-9]|1[0-2])$/.test(selectedMonth)
      ? selectedMonth
      : todayMadrid().slice(0, 7);
  const first = `${selected}-01`,
    next = addMonths(first, 1);
  const { patients, sales, monthly_reviews: reviews, patient_periods: periods } = w.data;
  const rows = sales
    .filter((s) => s.sold_on >= first && s.sold_on < next)
    .sort((a, b) => b.sold_on.localeCompare(a.sold_on));
  const fields: Field[] = [
    {
      name: 'patient_id',
      label: 'Paciente (código Farmatic)',
      type: 'select',
      required: true,
      options: patientOptions(patients),
    },
    {
      name: 'sold_on',
      label: 'Fecha real de la venta',
      type: 'date',
      required: true,
      max: todayMadrid(),
      hint: 'Elige cuándo ocurrió, aunque la registres otro día.',
    },
  ];
  const expected = patients.filter((p) =>
    periods.some((s) => s.patient_id === p.id && s.starts_on < next && (!s.ends_on || s.ends_on >= first)),
  );
  return (
    <>
      <PageHeader
        eyebrow="CADA COMPRA, EN SU MES"
        title="La actividad, con su fecha real."
        description="Registra las ventas cuando las compruebes. El cálculo siempre usará el día en que ocurrieron."
      >
        <a href="#nueva-venta" className="button primary">
          <Plus size={16} /> Registrar venta
        </a>
      </PageHeader>
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Comprobación de {monthLabel(first)}</h2>
            <p>Una o varias ventas cuentan como un solo mes con compra por paciente.</p>
          </div>
          <form className="search-form">
            <input type="month" name="month" aria-label="Mes de comprobación" defaultValue={selected} />
            <button className="button secondary">Ver mes</button>
          </form>
        </div>
        {expected.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Paciente</th>
                  <th>Ventas del mes</th>
                  <th>Estado de comprobación</th>
                  <th>Acción</th>
                </tr>
              </thead>
              <tbody>
                {expected.map((p) => {
                  const buys = rows.filter((s) => s.patient_id === p.id && !s.voided);
                  const review = reviews.find((r) => r.patient_id === p.id && r.month === first);
                  return (
                    <tr key={p.id}>
                      <td className="code">{p.farmatic_code}</td>
                      <td>
                        {buys.length}
                        {buys.length > 0 && (
                          <small>
                            Primera:{' '}
                            {formatDate(
                              [...buys].sort((a, b) => a.sold_on.localeCompare(b.sold_on))[0].sold_on,
                            )}
                          </small>
                        )}
                      </td>
                      <td>
                        <Badge
                          tone={buys.length ? 'green' : review?.status === 'SIN_COMPRA' ? 'neutral' : 'amber'}
                        >
                          {buys.length
                            ? 'Con compra'
                            : review?.status === 'SIN_COMPRA'
                              ? 'Sin compra'
                              : 'Pendiente de comprobar'}
                        </Badge>
                      </td>
                      <td>
                        {!buys.length && (
                          <form action={saveAction}>
                            <Hidden path="/ventas" id={review?.id} version={review?.version} />
                            <input type="hidden" name="resource" value="monthly_reviews" />
                            <input type="hidden" name="patient_id" value={p.id} />
                            <input type="hidden" name="month" value={first} />
                            <input
                              type="hidden"
                              name="status"
                              value={review?.status === 'SIN_COMPRA' ? 'PENDIENTE' : 'SIN_COMPRA'}
                            />
                            <button
                              className="button compact secondary"
                              disabled={
                                w.preview ||
                                (review?.status !== 'SIN_COMPRA' &&
                                  first >= `${todayMadrid().slice(0, 7)}-01`)
                              }
                            >
                              {review?.status === 'SIN_COMPRA'
                                ? 'Volver a pendiente'
                                : 'Confirmar sin compra'}
                            </button>
                          </form>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty
            title="Sin pacientes que comprobar en este mes"
            description="Las comprobaciones aparecerán según los periodos de alta de cada paciente."
            icon={ShoppingBag}
          />
        )}
      </section>
      <section className="panel form-panel" id="nueva-venta">
        <div className="panel-heading">
          <div>
            <h2>Registrar una venta</h2>
            <p>La fecha de registro y la persona que la registra se guardan automáticamente.</p>
          </div>
        </div>
        <ResourceForm
          resource="sales"
          path="/ventas"
          fields={fields}
          disabled={w.preview}
          label="Guardar venta con su fecha real"
        />
      </section>
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Ventas registradas</h2>
            <p>Detalle del mes seleccionado, incluidas las anulaciones para conservar el historial.</p>
          </div>
        </div>
        {rows.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Paciente</th>
                  <th>Fecha real</th>
                  <th>Registrada el</th>
                  <th>Estado</th>
                  <th>Corrección</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((s) => (
                  <tr key={s.id}>
                    <td className="code">{patients.find((p) => p.id === s.patient_id)?.farmatic_code}</td>
                    <td>{formatDate(s.sold_on)}</td>
                    <td>{formatDate(s.recorded_at)}</td>
                    <td>
                      <Badge tone={s.voided ? 'neutral' : 'green'}>{s.voided ? 'Anulada' : 'Válida'}</Badge>
                    </td>
                    <td>
                      <Editor label="Corregir venta">
                        <ResourceForm
                          resource="sales"
                          path="/ventas"
                          fields={[
                            ...fields,
                            { name: 'voided', label: 'Anular esta venta', type: 'checkbox' },
                            {
                              name: 'correction_reason',
                              label: 'Motivo administrativo de la corrección',
                              required: true,
                              hint: 'No incluyas información clínica.',
                            },
                          ]}
                          record={s}
                          disabled={w.preview}
                        />
                      </Editor>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty
            title="Todavía no hay ventas registradas este mes"
            description="Cada venta quedará vinculada a su fecha efectiva y a la persona que la registró."
            icon={ShoppingBag}
          />
        )}
      </section>
    </>
  );
}

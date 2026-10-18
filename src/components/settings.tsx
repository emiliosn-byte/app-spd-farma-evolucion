import { Download, Settings2, ShieldCheck, UsersRound } from 'lucide-react';
import { PageHeader, Empty, Badge } from './shell';
import { ResourceForm, Editor, Input, Hidden, employeeOptions, patientOptions, type Field } from './forms';
import { createAccountAction, resetAccountAction, passwordAction } from '@/app/actions';
import { formatDate } from '@/lib/dates';
import type { loadWorkspace } from '@/lib/data';
type Workspace = Awaited<ReturnType<typeof loadWorkspace>>;
const roles = [
  { value: 'estandar', label: 'Estándar' },
  { value: 'administrador', label: 'Administrador' },
  { value: 'superpowers', label: 'Superpowers' },
];
export function Settings({ w }: { w: Workspace }) {
  const superpowers = w.profile.role === 'superpowers';
  const {
    employees,
    employment_periods: periods = [],
    external_management: external = [],
    patients,
    profiles = [],
  } = w.data;
  const employeeFields: Field[] = [
    { name: 'name', label: 'Nombre de la empleada', required: true },
    { name: 'sort_order', label: 'Orden estable para céntimos', type: 'number', required: true },
  ];
  const hoursFields: Field[] = [
    {
      name: 'employee_id',
      label: 'Empleada',
      type: 'select',
      required: true,
      options: employeeOptions(employees),
    },
    { name: 'starts_on', label: 'Desde', type: 'date', required: true },
    { name: 'ends_on', label: 'Hasta (incluido)', type: 'date' },
    {
      name: 'weekly_hours',
      label: 'Horas semanales acordadas',
      type: 'number',
      step: '0.01',
      required: true,
    },
  ];
  const externalFields: Field[] = [
    {
      name: 'patient_id',
      label: 'Paciente de captación externa',
      type: 'select',
      required: true,
      options: patientOptions(patients.filter((p) => p.origin === 'EXTERNA')),
    },
    {
      name: 'employee_id',
      label: 'Captadora externa',
      type: 'select',
      required: true,
      options: employeeOptions(employees),
    },
    { name: 'starts_on', label: 'Aceptación y gestión desde', type: 'date', required: true },
    { name: 'ends_on', label: 'Fin de la gestión (incluido)', type: 'date' },
    {
      name: 'accepted',
      label: 'La captadora acepta y mantiene la gestión de la medicación',
      type: 'checkbox',
    },
  ];
  const profileFields: Field[] = [
    { name: 'display_name', label: 'Nombre visible', required: true },
    { name: 'role', label: 'Rol', type: 'select', required: true, options: roles },
    {
      name: 'employee_id',
      label: 'Empleada asociada (opcional)',
      type: 'select',
      options: employeeOptions(employees),
    },
    { name: 'enabled', label: 'Acceso habilitado', type: 'checkbox' },
  ];
  return (
    <>
      <PageHeader
        eyebrow="UN EQUIPO QUE PUEDE CRECER"
        title="Personas, jornadas y acceso."
        description="Conserva el historial de cada cambio para que los repartos siempre sean explicables."
      >
        {superpowers && !w.preview && (
          <a href="/api/export?type=full" className="button secondary">
            <Download size={16} /> Exportación completa
          </a>
        )}
      </PageHeader>
      {w.preview && (
        <section className="setup-card">
          <div>
            <span className="eyebrow">ANTES DE EMPEZAR</span>
            <h2>
              La aplicación está preparada.
              <br />
              Falta conectar tu espacio de datos.
            </h2>
            <p>
              Aplica las migraciones de Supabase y configura la URL, la clave publicable y la credencial
              administrativa en el servidor. El manual del proyecto incluye los pasos y la creación de la
              primera cuenta.
            </p>
            <p>La vista previa no usa usuarios reales ni guarda datos en tu navegador.</p>
          </div>
          <span className="setup-icon">
            <Settings2 size={38} strokeWidth={1.2} />
          </span>
        </section>
      )}
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>
              Equipo beneficiario <span className="count">{employees.length}</span>
            </h2>
            <p>Configura las cinco empleadas iniciales. Podrás incorporar nuevas personas después.</p>
          </div>
          <UsersRound size={22} />
        </div>
        {employees.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Empleada</th>
                  <th>Orden de céntimos</th>
                  {superpowers && <th>Gestión</th>}
                </tr>
              </thead>
              <tbody>
                {employees
                  .sort((a, b) => a.sort_order - b.sort_order)
                  .map((e) => (
                    <tr key={e.id}>
                      <td>{e.name}</td>
                      <td>{e.sort_order}</td>
                      {superpowers && (
                        <td>
                          <Editor>
                            <ResourceForm
                              resource="employees"
                              path="/configuracion"
                              fields={employeeFields}
                              record={e}
                              disabled={w.preview}
                            />
                          </Editor>
                        </td>
                      )}
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty
            title="Un equipo con espacio para crecer"
            description="Añade los nombres reales de las beneficiarias. Los accesos se crean por separado."
            icon={UsersRound}
          />
        )}{' '}
        {superpowers && (
          <Editor label="Añadir empleada">
            <ResourceForm
              resource="employees"
              path="/configuracion"
              fields={employeeFields}
              defaults={{ sort_order: employees.length + 1 }}
              disabled={w.preview}
            />
          </Editor>
        )}
      </section>
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Jornadas con fecha de vigencia</h2>
            <p>
              Inicialmente, 38,5 h semanales. Para cambiar una jornada, cierra el periodo anterior y crea el
              siguiente sin solapamientos.
            </p>
          </div>
        </div>
        {periods.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Empleada</th>
                  <th>Desde</th>
                  <th>Hasta</th>
                  <th>Horas / semana</th>
                  {superpowers && <th>Gestión</th>}
                </tr>
              </thead>
              <tbody>
                {periods
                  .sort((a, b) => b.starts_on.localeCompare(a.starts_on))
                  .map((p) => (
                    <tr key={p.id}>
                      <td>{employees.find((e) => e.id === p.employee_id)?.name}</td>
                      <td>{formatDate(p.starts_on)}</td>
                      <td>{p.ends_on ? formatDate(p.ends_on) : 'Sin fecha de fin'}</td>
                      <td className="amount">{p.weekly_hours} h</td>
                      {superpowers && (
                        <td>
                          <Editor>
                            <ResourceForm
                              resource="employment_periods"
                              path="/configuracion"
                              fields={hoursFields}
                              record={p}
                              disabled={w.preview}
                            />
                          </Editor>
                        </td>
                      )}
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty
            title="Las jornadas definirán el reparto"
            description="Cada periodo conserva las horas acordadas y sus fechas de vigencia."
          />
        )}
        {superpowers && (
          <Editor label="Añadir periodo de jornada">
            <ResourceForm
              resource="employment_periods"
              path="/configuracion"
              fields={hoursFields}
              defaults={{ weekly_hours: 38.5 }}
              disabled={w.preview}
            />
          </Editor>
        )}
      </section>
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Continuidad de captaciones externas</h2>
            <p>
              Tras la baja laboral, solo conserva el incentivo quien acepta continuar y gestiona la medicación
              de ese paciente.
            </p>
          </div>
        </div>
        {external.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Paciente</th>
                  <th>Captadora</th>
                  <th>Periodo</th>
                  <th>Aceptación</th>
                  {superpowers && <th>Gestión</th>}
                </tr>
              </thead>
              <tbody>
                {external.map((e) => (
                  <tr key={e.id}>
                    <td className="code">{patients.find((p) => p.id === e.patient_id)?.farmatic_code}</td>
                    <td>{employees.find((p) => p.id === e.employee_id)?.name}</td>
                    <td>
                      {formatDate(e.starts_on)} → {e.ends_on ? formatDate(e.ends_on) : 'En continuidad'}
                    </td>
                    <td>
                      <Badge tone={e.accepted ? 'green' : 'neutral'}>
                        {e.accepted ? 'Validada' : 'No aceptada'}
                      </Badge>
                    </td>
                    {superpowers && (
                      <td>
                        <Editor>
                          <ResourceForm
                            resource="external_management"
                            path="/configuracion"
                            fields={externalFields}
                            record={e}
                            disabled={w.preview}
                          />
                        </Editor>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="panel-text">No hay continuidades externas registradas.</p>
        )}
        {superpowers && (
          <Editor label="Validar una continuidad externa">
            <ResourceForm
              resource="external_management"
              path="/configuracion"
              fields={externalFields}
              defaults={{ accepted: true }}
              disabled={w.preview}
            />
          </Editor>
        )}
        <p className="panel-footnote">
          Al finalizar la gestión, se conserva lo generado hasta esa fecha y dejan de generarse derechos
          posteriores. No se transfieren a otra persona ni al mostrador.
        </p>
      </section>
      {superpowers && (
        <>
          <section className="panel">
            <div className="panel-heading">
              <div>
                <h2>Cuentas y permisos</h2>
                <p>Una cuenta no es una beneficiaria. Asocia ambas solo cuando corresponda.</p>
              </div>
              <ShieldCheck size={22} />
            </div>
            {profiles.length ? (
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Cuenta</th>
                      <th>Rol</th>
                      <th>Empleada asociada</th>
                      <th>Estado</th>
                      <th>Gestión</th>
                    </tr>
                  </thead>
                  <tbody>
                    {profiles.map((p) => (
                      <tr key={p.id}>
                        <td>{p.display_name}</td>
                        <td>{p.role}</td>
                        <td>{employees.find((e) => e.id === p.employee_id)?.name ?? 'Sin asociación'}</td>
                        <td>
                          <Badge tone={p.enabled ? 'green' : 'neutral'}>
                            {p.enabled ? 'Habilitada' : 'Deshabilitada'}
                          </Badge>
                        </td>
                        <td>
                          <Editor>
                            <ResourceForm
                              resource="profiles"
                              path="/configuracion"
                              fields={profileFields}
                              record={p}
                              disabled={w.preview}
                            />
                          </Editor>
                          {p.id !== w.profile.id && (
                            <Editor label="Restablecer contraseña">
                              <form action={resetAccountAction} className="record-form">
                                <Hidden path="/configuracion" id={p.id} />
                                <Input
                                  field={{
                                    name: 'password',
                                    label: 'Contraseña temporal (mínimo 12 caracteres)',
                                    type: 'password',
                                    required: true,
                                  }}
                                />
                                <button className="button secondary" disabled={w.preview}>
                                  Restablecer acceso
                                </button>
                              </form>
                            </Editor>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="panel-text">
                Las cuentas aparecerán al conectar Supabase y crear el primer acceso.
              </p>
            )}
            <Editor label="Crear una cuenta">
              <form action={createAccountAction} className="record-form">
                <Hidden path="/configuracion" />
                <div className="form-grid">
                  <Input
                    field={{ name: 'email', label: 'Correo de acceso', type: 'email', required: true }}
                  />
                  <Input field={{ name: 'display_name', label: 'Nombre visible', required: true }} />
                  <Input
                    field={{
                      name: 'password',
                      label: 'Contraseña temporal (mínimo 12 caracteres)',
                      type: 'password',
                      required: true,
                    }}
                  />
                  <Input
                    field={{ name: 'role', label: 'Rol', type: 'select', options: roles, required: true }}
                    value="estandar"
                  />
                  <Input
                    field={{
                      name: 'employee_id',
                      label: 'Empleada asociada',
                      type: 'select',
                      options: employeeOptions(employees),
                    }}
                  />
                </div>
                <p className="muted">
                  Comunica la contraseña por un canal privado. Tendrá que cambiarla en el primer acceso. No se
                  enviará ningún correo.
                </p>
                <button className="button primary" disabled={w.preview}>
                  Crear cuenta
                </button>
              </form>
            </Editor>
          </section>
          <section className="panel">
            <div className="panel-heading">
              <div>
                <h2>Copias y recuperación</h2>
                <p>
                  La exportación web conserva los datos administrativos. La utilidad local añade el mapa de
                  accesos necesario para restaurarlos, sin contraseñas.
                </p>
              </div>
            </div>
            <p className="panel-text">
              El manual incluye los comandos de copia y restauración y la utilidad local de recuperación de la
              cuenta del titular. Realiza una copia antes de cada liquidación y conserva otra fuera del
              proyecto.
            </p>
            {!w.preview && (
              <a className="button secondary" href="/api/export?type=full">
                <Download size={16} /> Descargar datos administrativos
              </a>
            )}
          </section>
        </>
      )}
    </>
  );
}
export function Account({ w }: { w: Workspace }) {
  return (
    <>
      <PageHeader
        eyebrow="TU ACCESO PERSONAL"
        title="Tu cuenta, bajo tu control."
        description="Actualiza tu contraseña. Los roles y permisos los gestiona superpowers."
      />
      {w.profile.must_change_password && (
        <div className="notice warning" role="status">
          Debes cambiar tu contraseña temporal antes de acceder a los datos de la farmacia.
        </div>
      )}
      <section className="panel form-panel account-panel">
        <div className="panel-heading">
          <div>
            <h2>{w.profile.display_name}</h2>
            <p>Rol: {w.profile.role}</p>
          </div>
          <ShieldCheck size={24} />
        </div>
        <form action={passwordAction} className="record-form">
          <Hidden path="/cuenta" />
          <div className="form-grid">
            <Input
              field={{
                name: 'password',
                label: 'Nueva contraseña (mínimo 12 caracteres)',
                type: 'password',
                required: true,
              }}
            />
            <Input
              field={{
                name: 'confirmation',
                label: 'Repite la nueva contraseña',
                type: 'password',
                required: true,
              }}
            />
          </div>
          <button className="button primary" disabled={w.preview}>
            Cambiar contraseña
          </button>
        </form>
      </section>
    </>
  );
}

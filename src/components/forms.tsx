import { saveAction } from '@/app/actions';
import type { RecordRow } from '@/lib/types';
export type Field = {
  name: string;
  label: string;
  type?: 'text' | 'date' | 'month' | 'number' | 'checkbox' | 'select' | 'password' | 'email';
  required?: boolean;
  options?: { value: string; label: string }[];
  hint?: string;
  max?: string;
  step?: string;
  readOnly?: boolean;
};
export const employeeOptions = (rows: RecordRow[]) =>
  rows.map((r) => ({ value: r.id, label: String(r.name) }));
export const patientOptions = (rows: RecordRow[]) =>
  rows.map((r) => ({ value: r.id, label: `Farmatic ${r.farmatic_code}` }));
export const kindOptions = [
  { value: 'NUEVO', label: 'Nuevo' },
  { value: 'PROPIO', label: 'Propio' },
];
export const originOptions = [
  { value: 'MOSTRADOR', label: 'Mostrador' },
  { value: 'EXTERNA', label: 'Captación externa' },
  { value: 'TITULAR', label: 'Titular' },
];
export function Hidden({ path, id, version }: { path: string; id?: string; version?: number }) {
  return (
    <>
      <input type="hidden" name="return_to" value={path} />
      {id && (
        <>
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="version" value={version} />
        </>
      )}
    </>
  );
}
export function Input({ field, value }: { field: Field; value?: any }) {
  if (field.type === 'checkbox')
    return (
      <label className="check-field">
        <input type="hidden" name={field.name} value="false" />
        <input type="checkbox" name={field.name} value="true" defaultChecked={Boolean(value)} />
        <span>
          {field.label}
          {field.hint && <small>{field.hint}</small>}
        </span>
      </label>
    );
  return (
    <label className="field">
      <span>
        {field.label}
        {field.required && <i> *</i>}
      </span>
      {field.type === 'select' ? (
        <select name={field.name} defaultValue={value ?? ''} required={field.required}>
          <option value="">Seleccionar…</option>
          {field.options?.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      ) : (
        <input
          name={field.name}
          type={field.type ?? 'text'}
          defaultValue={field.type === 'month' ? String(value ?? '').slice(0, 7) : (value ?? '')}
          required={field.required}
          max={field.max}
          step={field.step ?? (field.type === 'number' ? '1' : undefined)}
          readOnly={field.readOnly}
          autoComplete={field.type === 'password' ? 'new-password' : undefined}
          inputMode={field.name === 'farmatic_code' ? 'numeric' : undefined}
        />
      )}{' '}
      {field.hint && <small>{field.hint}</small>}
    </label>
  );
}
export function ResourceForm({
  resource,
  path,
  fields,
  record,
  defaults = {},
  disabled = false,
  label = 'Guardar',
}: {
  resource: string;
  path: string;
  fields: Field[];
  record?: RecordRow;
  defaults?: Record<string, any>;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <form action={saveAction} className="record-form">
      <Hidden path={path} id={record?.id} version={record?.version} />
      <input type="hidden" name="resource" value={resource} />
      <div className="form-grid">
        {fields.map((field) => (
          <Input key={field.name} field={field} value={record ? record[field.name] : defaults[field.name]} />
        ))}
      </div>
      <button className="button primary" disabled={disabled}>
        {label}
      </button>
      {disabled && <small className="muted">Disponible al conectar Supabase.</small>}
    </form>
  );
}
export function Editor({
  children,
  label = 'Editar registro',
}: {
  children: React.ReactNode;
  label?: string;
}) {
  return (
    <details className="editor">
      <summary>{label}</summary>
      <div className="editor-body">{children}</div>
    </details>
  );
}
export const taskFields = (
  employees: RecordRow[],
  patients: RecordRow[],
  prospects: RecordRow[],
): Field[] => [
  { name: 'patient_id', label: 'Paciente', type: 'select', options: patientOptions(patients) },
  {
    name: 'prospect_id',
    label: 'O interesado',
    type: 'select',
    options: prospects
      .filter((p) => p.status !== 'CONVERTIDO')
      .map((p) => ({ value: p.id, label: p.reference })),
  },
  { name: 'assignee_id', label: 'Responsable', type: 'select', options: employeeOptions(employees) },
  {
    name: 'action',
    label: 'Acción administrativa',
    type: 'select',
    required: true,
    options: [
      { value: 'CONTACTAR', label: 'Contactar' },
      { value: 'COMPROBAR_COMPRA', label: 'Comprobar compra' },
      { value: 'REVISAR_ALTA', label: 'Revisar alta' },
      { value: 'SEGUIMIENTO_ADMINISTRATIVO', label: 'Seguimiento administrativo' },
    ],
  },
  { name: 'due_on', label: 'Fecha prevista', type: 'date', required: true },
  { name: 'done', label: 'Completada', type: 'checkbox' },
];

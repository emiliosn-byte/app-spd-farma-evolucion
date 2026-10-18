'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireSession } from '@/lib/session';
import { configured, supabase, adminSupabase } from '@/lib/supabase';
z.config(z.locales.es());

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Indique una fecha válida');
const uuid = z.uuid();
const nullableId = uuid.nullable();
const schemas = {
  patients: z.object({
    farmatic_code: z.string().regex(/^\d{1,30}$/, 'El código Farmatic debe contener solo números'),
    joined_on: date,
    kind: z.enum(['NUEVO', 'PROPIO']),
    origin: z.enum(['MOSTRADOR', 'EXTERNA', 'TITULAR']),
    captor_id: nullableId,
    followup_id: nullableId,
    validated: z.boolean().optional(),
  }),
  prospects: z.object({
    captor_id: nullableId,
    origin: z.enum(['MOSTRADOR', 'EXTERNA', 'TITULAR']),
    status: z.enum(['INTERESADO', 'CONTACTADO', 'DESCARTADO']),
    next_action_on: date.nullable(),
  }),
  sales: z.object({
    patient_id: uuid,
    sold_on: date,
    voided: z.boolean().optional(),
    correction_reason: z.string().max(300).nullable().optional(),
  }),
  monthly_reviews: z.object({ patient_id: uuid, month: date, status: z.enum(['PENDIENTE', 'SIN_COMPRA']) }),
  tasks: z.object({
    patient_id: nullableId,
    prospect_id: nullableId,
    assignee_id: nullableId,
    action: z.enum(['CONTACTAR', 'COMPROBAR_COMPRA', 'REVISAR_ALTA', 'SEGUIMIENTO_ADMINISTRATIVO']),
    due_on: date,
    done: z.boolean().optional(),
  }),
  employees: z.object({
    name: z.string().trim().min(1).max(100),
    sort_order: z.coerce.number().int().min(0),
  }),
  employment_periods: z.object({
    employee_id: uuid,
    starts_on: date,
    ends_on: date.nullable(),
    weekly_hours: z.coerce.number().positive().max(80),
  }),
  external_management: z.object({
    patient_id: uuid,
    employee_id: uuid,
    starts_on: date,
    ends_on: date.nullable(),
    accepted: z.boolean(),
  }),
  profiles: z.object({
    display_name: z.string().trim().min(1).max(100),
    role: z.enum(['estandar', 'administrador', 'superpowers']),
    enabled: z.boolean(),
    employee_id: nullableId,
  }),
};
const pathFrom = (form: FormData) => {
  const path = String(form.get('return_to') ?? '/');
  return /^\/(?:interesados|pacientes|ventas|liquidaciones|configuracion|cuenta)?$/.test(path) ? path : '/';
};
function message(error: unknown) {
  if (error instanceof z.ZodError) return error.issues[0]?.message ?? 'Compruebe los datos';
  const value = error as { code?: string; message?: string };
  if (value.code === '23505') return 'Ya existe un registro con ese código, cuenta o periodo.';
  if (value.code === '23514')
    return 'Los datos no cumplen las condiciones del registro. Compruebe las fechas y los campos obligatorios.';
  if (value.code === '23503') return 'Una de las referencias ya no existe. Actualice la página.';
  if (value.code === 'P0001') return value.message ?? 'No se pudo realizar la operación.';
  return 'No se pudo realizar la operación. Compruebe los datos, los permisos y la conexión.';
}
async function operation(
  form: FormData,
  work: (session: Awaited<ReturnType<typeof requireSession>>) => Promise<void>,
  success = 'Cambios guardados',
  allowPassword = false,
) {
  const session = await requireSession(allowPassword);
  let error: string | null = null;
  if (session.preview)
    error = 'Esta es una vista previa sin conexión. Configure Supabase para guardar datos.';
  else {
    try {
      await work(session);
    } catch (e) {
      error = message(e);
    }
  }
  revalidatePath('/', 'layout');
  redirect(`${pathFrom(form)}?${error ? 'error' : 'success'}=${encodeURIComponent(error ?? success)}`);
}
export async function saveAction(form: FormData) {
  await operation(form, async ({ client }) => {
    const resource = String(form.get('resource')) as keyof typeof schemas;
    const schema = schemas[resource];
    if (!schema) throw new Error('Recurso inválido');
    const patch: Record<string, unknown> = {};
    for (const key of Object.keys(schema.shape)) {
      if (!form.has(key)) continue;
      const value = String(form.get(key) ?? '').trim();
      patch[key] = ['validated', 'voided', 'done', 'accepted', 'enabled'].includes(key)
        ? form.getAll(key).includes('true')
        : value === ''
          ? null
          : value;
    }
    if (
      resource === 'monthly_reviews' &&
      typeof patch.month === 'string' &&
      /^\d{4}-\d{2}$/.test(patch.month)
    )
      patch.month += '-01';
    const parsed = form.get('id') ? schema.partial().parse(patch) : schema.parse(patch);
    const { error } = await client!.rpc('save_record', {
      p_resource: resource,
      p_patch: parsed,
      p_id: form.get('id') ? uuid.parse(form.get('id')) : null,
      p_version: form.get('id') ? z.coerce.number().int().positive().parse(form.get('version')) : null,
    });
    if (error) throw error;
  });
}
export async function convertAction(form: FormData) {
  await operation(
    form,
    async ({ client }) => {
      const { error } = await client!.rpc('convert_prospect', {
        p_id: uuid.parse(form.get('id')),
        p_version: z.coerce.number().int().parse(form.get('version')),
        p_code: z
          .string()
          .regex(/^\d{1,30}$/)
          .parse(form.get('farmatic_code')),
        p_joined: date.parse(form.get('joined_on')),
        p_kind: z.enum(['NUEVO', 'PROPIO']).parse(form.get('kind')),
      });
      if (error) throw error;
    },
    'Interesado convertido a paciente; historial conservado',
  );
}
export async function statusAction(form: FormData) {
  await operation(form, async ({ client }) => {
    const { error } = await client!.rpc('set_patient_status', {
      p_id: uuid.parse(form.get('id')),
      p_version: z.coerce.number().int().parse(form.get('version')),
      p_date: date.parse(form.get('effective_on')),
      p_active: form.get('active') === 'true',
    });
    if (error) throw error;
  });
}
export async function createSettlementAction(form: FormData) {
  await operation(
    form,
    async ({ client }) => {
      const { error } = await client!.rpc('create_settlement', {
        p_start: date.parse(form.get('period_start')),
      });
      if (error) throw error;
    },
    'Borrador preparado. Revise el detalle antes de aprobar',
  );
}
export async function approveAction(form: FormData) {
  await operation(
    form,
    async ({ client }) => {
      const { error } = await client!.rpc('approve_settlement', {
        p_id: uuid.parse(form.get('id')),
        p_signature: z.string().length(32).parse(form.get('signature')),
      });
      if (error) throw error;
    },
    'Liquidación aprobada y conservada en el historial',
  );
}
export async function paymentAction(form: FormData) {
  await operation(
    form,
    async ({ client }) => {
      const { error } = await client!.rpc('record_payment', {
        p_settlement: uuid.parse(form.get('settlement_id')),
        p_employee: uuid.parse(form.get('employee_id')),
        p_paid_on: date.parse(form.get('paid_on')),
        p_reference: z
          .string()
          .max(200)
          .parse(form.get('reference') ?? ''),
      });
      if (error) throw error;
    },
    'Pago registrado',
  );
}
export async function createAccountAction(form: FormData) {
  await operation(
    form,
    async ({ client, profile }) => {
      if (profile.role !== 'superpowers') throw new Error('No autorizado');
      const values = z
        .object({
          email: z.email(),
          password: z.string().min(12).max(128),
          name: z.string().trim().min(1).max(100),
          role: z.enum(['estandar', 'administrador', 'superpowers']),
          employee: nullableId,
        })
        .parse({
          email: form.get('email'),
          password: form.get('password'),
          name: form.get('display_name'),
          role: form.get('role'),
          employee: form.get('employee_id') || null,
        });
      const admin = adminSupabase();
      const { data, error } = await admin.auth.admin.createUser({
        email: values.email,
        password: values.password,
        email_confirm: true,
      });
      if (error || !data.user) throw new Error('No se pudo crear la cuenta');
      const result = await client!.rpc('provision_profile', {
        p_user: data.user.id,
        p_name: values.name,
        p_role: values.role,
        p_employee: values.employee,
      });
      if (result.error) {
        await admin.auth.admin.deleteUser(data.user.id);
        throw result.error;
      }
    },
    'Cuenta creada. Comunique la contraseña temporal por un canal privado',
  );
}
export async function resetAccountAction(form: FormData) {
  await operation(
    form,
    async ({ client, profile }) => {
      if (profile.role !== 'superpowers') throw new Error('No autorizado');
      const id = uuid.parse(form.get('id'));
      if (id === profile.id) throw new Error('Utilice el cambio de contraseña propio');
      const password = z.string().min(12).max(128).parse(form.get('password'));
      const { error: flag } = await client!.rpc('request_password_reset', { p_user: id });
      if (flag) throw flag;
      const { error } = await adminSupabase().auth.admin.updateUserById(id, { password });
      if (error) throw new Error('No se pudo restablecer la contraseña');
    },
    'Contraseña temporal restablecida',
  );
}
export async function passwordAction(form: FormData) {
  await operation(
    form,
    async ({ client, profile }) => {
      const password = z.string().min(12, 'Use al menos 12 caracteres').max(128).parse(form.get('password'));
      if (password !== form.get('confirmation'))
        throw new z.ZodError([{ code: 'custom', message: 'Las contraseñas no coinciden', path: [] }]);
      const { error } = await client!.auth.updateUser({ password });
      if (error) throw new Error('No se pudo cambiar la contraseña');
      const { error: flag } = await adminSupabase()
        .from('profiles')
        .update({ must_change_password: false })
        .eq('id', profile.id);
      if (flag) throw flag;
    },
    'Contraseña actualizada',
    true,
  );
}
export async function loginAction(form: FormData) {
  if (!configured()) redirect('/login?error=Configure%20Supabase%20antes%20de%20iniciar%20sesión');
  const parsed = z
    .object({ email: z.email(), password: z.string().min(1).max(128) })
    .safeParse({ email: form.get('email'), password: form.get('password') });
  if (!parsed.success) redirect('/login?error=Introduzca%20un%20correo%20y%20contraseña%20válidos');
  const client = await supabase();
  const { error } = await client.auth.signInWithPassword(parsed.data);
  if (error) redirect('/login?error=Correo%20o%20contraseña%20incorrectos');
  const {
    data: { user },
  } = await client.auth.getUser();
  const { data: profile } = await client.from('profiles').select('enabled').eq('id', user!.id).single();
  if (!profile?.enabled) {
    await client.auth.signOut();
    redirect('/login?error=Acceso%20no%20autorizado');
  }
  redirect('/');
}
export async function logoutAction() {
  if (configured()) {
    const client = await supabase();
    await client.auth.signOut();
  }
  redirect('/login');
}

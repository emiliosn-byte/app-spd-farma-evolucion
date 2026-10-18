import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const owner = '10000000-0000-0000-0000-000000000001',
  admin = '10000000-0000-0000-0000-000000000002',
  standard = '10000000-0000-0000-0000-000000000003';
const employees = Array.from({ length: 5 }, (_, i) => `20000000-0000-0000-0000-00000000000${i + 1}`);
test('Base de datos: cálculos, acceso, cierres y trazabilidad', async (t) => {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
 create schema auth; create table auth.users(id uuid primary key,email text);
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;`);
  for (const file of (await readdir('supabase/migrations')).filter((f) => f.endsWith('.sql')).sort())
    await db.exec(await readFile(`supabase/migrations/${file}`, 'utf8'));
  await db.exec(`insert into auth.users(id) values('${owner}'),('${admin}'),('${standard}');
 insert into public.profiles(id,display_name,role,must_change_password) values('${owner}','Titular','superpowers',false),('${admin}','Administración','administrador',false),('${standard}','Equipo','estandar',false);`);
  for (const [i, id] of employees.entries())
    await db.query(`insert into public.employees(id,name,sort_order) values($1,$2,$3);`, [
      id,
      `Empleada ${i + 1}`,
      i,
    ]);
  for (const id of employees)
    await db.query(
      `insert into public.employment_periods(employee_id,starts_on,weekly_hours) values($1,'2020-01-01',38.5)`,
      [id],
    );
  await db.query(`update public.profiles set employee_id=$1 where id=$2`, [employees[0], standard]);
  const as = async (id: string) => {
    await db.exec(
      `reset role; select set_config('request.jwt.claim.sub','${id}',false); set role authenticated;`,
    );
  };
  const rejects = async (fn: () => Promise<unknown>, pattern: RegExp) => {
    await db.exec('savepoint expected_error');
    try {
      await assert.rejects(fn, pattern);
    } finally {
      await db.exec('rollback to savepoint expected_error');
    }
  };
  const save = async (
    resource: string,
    patch: object,
    id: string | null = null,
    version: number | null = null,
  ) =>
    (
      await db.query<{ v: any }>(`select public.save_record($1,$2::jsonb,$3::uuid,$4) v`, [
        resource,
        JSON.stringify(patch),
        id,
        version,
      ])
    ).rows[0].v;
  const patient = async (code = '000123', kind = 'NUEVO', origin = 'MOSTRADOR', joined = '2024-01-01') =>
    save('patients', {
      farmatic_code: code,
      joined_on: joined,
      kind,
      origin,
      captor_id: origin === 'EXTERNA' ? employees[0] : null,
      validated: true,
    });
  const sales = async (id: string, months: string[]) => {
    for (const m of months) await save('sales', { patient_id: id, sold_on: `${m}-10` });
  };
  const total = async (cutoff: string, mature = true) =>
    Number(
      (
        await db.query<{ n: string }>(
          `select coalesce(sum(amount),0) n from public.incentive_entitlements($1,$2)`,
          [cutoff, mature],
        )
      ).rows[0].n,
    );
  async function scenario(name: string, fn: () => Promise<void>) {
    await t.test(name, async () => {
      await db.exec('reset role; begin');
      await as(owner);
      try {
        await fn();
      } finally {
        await db.exec('rollback; reset role');
      }
    });
  }
  await scenario(
    'La primera venta inicia el programa, no el alta; se conservan ceros del código',
    async () => {
      const p = await patient('000001', 'NUEVO', 'MOSTRADOR', '2023-11-01');
      assert.equal(
        (await db.query<any>('select start_month::text from public.programme')).rows[0].start_month,
        null,
      );
      await sales(p.id, ['2024-01']);
      assert.equal(
        (await db.query<any>('select start_month::text from public.programme')).rows[0].start_month,
        '2024-01-01',
      );
      assert.equal(
        (await db.query<any>('select farmatic_code from public.patients')).rows[0].farmatic_code,
        '000001',
      );
      await rejects(() => patient('000001'), /unique|duplicad/i);
    },
  );
  await scenario('Doce compras generan 80 € NUEVO y 30 € PROPIO; varias ventas no suman meses', async () => {
    const p = await patient();
    const months = Array.from({ length: 12 }, (_, i) => `2024-${String(i + 1).padStart(2, '0')}`);
    await sales(p.id, months);
    await sales(p.id, ['2024-01']);
    await db.exec('reset role');
    assert.equal(await total('2024-12-31'), 80);
    await as(owner);
    await save('patients', { kind: 'PROPIO' }, p.id, 1);
    await db.exec('reset role');
    assert.equal(await total('2024-12-31'), 30);
  });
  await scenario('Diez meses y mantenimiento posterior usan las fórmulas pactadas', async () => {
    const p = await patient();
    await sales(
      p.id,
      Array.from({ length: 10 }, (_, i) => `2024-${String(i + 1).padStart(2, '0')}`),
    );
    await db.exec('reset role');
    assert.equal(await total('2024-12-31'), 71.11);
    await as(owner);
    await sales(
      p.id,
      Array.from({ length: 10 }, (_, i) => `2025-${String(i + 1).padStart(2, '0')}`),
    );
    await db.exec('reset role');
    const maintenance = await db.query<any>(
      `select sum(amount) n from public.incentive_entitlements('2025-12-31') where concept='MANTENIMIENTO'`,
    );
    assert.equal(Number(maintenance.rows[0].n), 33.33);
    await as(owner);
    await save('patients', { kind: 'PROPIO' }, p.id, 1);
    await db.exec('reset role');
    assert.equal(await total('2024-12-31'), 26.67);
    assert.equal(
      Number(
        (
          await db.query<any>(
            `select sum(amount) n from public.incentive_entitlements('2025-12-31') where concept='MANTENIMIENTO'`,
          )
        ).rows[0].n,
      ),
      12.5,
    );
  });
  await scenario(
    'La incorporación de una sexta empleada solo afecta desde su fecha y conserva el total',
    async () => {
      const p = await patient();
      await sales(p.id, ['2024-01', '2024-02', '2024-03']);
      const e = await save('employees', { name: 'Nueva empleada', sort_order: 6 });
      await save('employment_periods', { employee_id: e.id, starts_on: '2024-03-01', weekly_hours: 38.5 });
      await db.exec('reset role');
      const rows = (
        await db.query<any>(`select employee_id,amount from public.incentive_entitlements('2024-03-31')`)
      ).rows;
      assert.equal(rows.length, 6);
      assert.equal(
        rows.reduce((n, r) => n + Math.round(Number(r.amount) * 100), 0),
        4000,
      );
      assert.equal(Number(rows.find((r) => r.employee_id === e.id)?.amount), 2.22);
    },
  );
  await scenario('Una media jornada recibe la mitad que una jornada completa', async () => {
    await db.exec('reset role');
    await db.query(`update public.employment_periods set weekly_hours=19.25 where employee_id=$1`, [
      employees[0],
    ]);
    await as(owner);
    const p = await patient();
    await sales(p.id, ['2024-01', '2024-02', '2024-03']);
    await db.exec('reset role');
    const rows = (await db.query<any>(`select * from public.incentive_entitlements('2024-03-31')`)).rows;
    assert.ok(
      Math.abs(
        Number(rows.find((r) => r.employee_id === employees[1]).amount) -
          2 * Number(rows.find((r) => r.employee_id === employees[0]).amount),
      ) <= 0.02,
    );
  });
  await scenario('Cierre atómico, aprobación y pago idempotentes y permisos efectivos', async () => {
    const p = await patient();
    await sales(p.id, ['2024-01', '2024-02', '2024-03']);
    const id = (await db.query<any>(`select public.create_settlement('2024-01-01') id`)).rows[0].id;
    const preview = (await db.query<any>('select public.settlement_preview($1) v', [id])).rows[0].v;
    assert.deepEqual(preview.blockers, []);
    await as(admin);
    await rejects(
      () => db.query('select public.approve_settlement($1,$2)', [id, preview.signature]),
      /superpowers/,
    );
    await as(owner);
    await db.query('select public.approve_settlement($1,$2)', [id, preview.signature]);
    await db.query('select public.approve_settlement($1,$2)', [id, preview.signature]);
    assert.equal(
      Number((await db.query<any>('select count(*) n from public.settlement_lines')).rows[0].n),
      5,
    );
    await as(standard);
    assert.equal((await db.query('select * from public.settlement_lines')).rows.length, 1);
    await rejects(() => db.query('select public.incentive_entitlements($1)', ['2024-03-31']), /permission/);
    await rejects(
      () => db.query(`update public.profiles set role='superpowers' where id=$1`, [standard]),
      /permission/,
    );
    await as(owner);
    const paid = (
      await db.query<any>(`select public.record_payment($1,$2,public.today_madrid(),'Prueba') id`, [
        id,
        employees[0],
      ])
    ).rows[0].id;
    assert.equal(
      (
        await db.query<any>(`select public.record_payment($1,$2,public.today_madrid(),'Prueba') id`, [
          id,
          employees[0],
        ])
      ).rows[0].id,
      paid,
    );
    assert.equal(Number((await db.query<any>('select amount from public.payments')).rows[0].amount), 8);
  });
  await scenario(
    'Pendiente no equivale a sin compra y bloquea; un cambio invalida la previsualización',
    async () => {
      const p = await patient();
      await sales(p.id, ['2024-01']);
      const id = (await db.query<any>(`select public.create_settlement('2024-01-01') id`)).rows[0].id;
      const preview = (await db.query<any>('select public.settlement_preview($1) v', [id])).rows[0].v;
      assert.equal(preview.blockers.length, 2);
      await rejects(
        () => db.query('select public.approve_settlement($1,$2)', [id, preview.signature]),
        /pendientes/,
      );
      await save('monthly_reviews', { patient_id: p.id, month: '2024-02-01', status: 'SIN_COMPRA' });
      await save('monthly_reviews', { patient_id: p.id, month: '2024-03-01', status: 'SIN_COMPRA' });
      await rejects(
        () => db.query('select public.approve_settlement($1,$2)', [id, preview.signature]),
        /cambiado/,
      );
    },
  );
  await scenario('Baja, reactivación y tercer mes fuera del primer ciclo no duplican captación', async () => {
    const p = await patient();
    await sales(p.id, ['2024-01', '2024-02', '2024-03', '2024-04']);
    await db.query(`select public.set_patient_status($1,1,'2024-04-30',false)`, [p.id]);
    await db.exec('reset role');
    assert.equal(await total('2024-04-30'), 44.44);
    await as(owner);
    await db.query(`select public.set_patient_status($1,2,'2024-05-01',true)`, [p.id]);
    await sales(p.id, ['2024-05', '2024-06']);
    await db.exec('reset role');
    assert.equal(await total('2024-06-30'), 44.44);
    assert.equal(await total('2024-12-31'), 53.33);
  });
  await scenario(
    'Captación externa después de salir exige continuidad; titular no genera importes',
    async () => {
      await db.exec('reset role');
      await db.query(`update public.employment_periods set ends_on='2024-03-31' where employee_id=$1`, [
        employees[0],
      ]);
      await as(owner);
      const p = await patient('000123', 'NUEVO', 'EXTERNA');
      await sales(
        p.id,
        Array.from({ length: 12 }, (_, i) => `2024-${String(i + 1).padStart(2, '0')}`),
      );
      await db.exec('reset role');
      assert.equal(await total('2024-12-31'), 40);
      await as(owner);
      await save('external_management', {
        patient_id: p.id,
        employee_id: employees[0],
        starts_on: '2024-04-01',
        ends_on: '2024-10-31',
        accepted: true,
      });
      await db.exec('reset role');
      assert.equal(await total('2024-12-31'), 71.11);
      await as(owner);
      const titular = await patient('000456', 'NUEVO', 'TITULAR');
      await sales(titular.id, ['2024-01', '2024-02', '2024-03']);
      await db.exec('reset role');
      assert.equal(await total('2024-12-31'), 71.11);
    },
  );
  await scenario('Concurrencia, validaciones y auditoría', async () => {
    const p = await patient();
    await save('patients', { followup_id: employees[0] }, p.id, 1);
    await rejects(() => save('patients', { kind: 'PROPIO' }, p.id, 1), /cambiado/);
    await rejects(() => save('sales', { patient_id: p.id, sold_on: '2099-01-01' }), /futura/);
    await rejects(() => save('sales', { patient_id: p.id, sold_on: '2023-12-01' }), /periodo/);
    await rejects(
      () =>
        save('employment_periods', { employee_id: employees[0], starts_on: '2024-01-01', weekly_hours: 20 }),
      /solaparse/,
    );
    assert.ok((await db.query('select * from public.audit_log')).rows.length > 0);
    await as(standard);
    await rejects(() => save('patients', { validated: true }, p.id, 2), /validar/);
    await db.exec('reset role');
    await db.query('update public.profiles set enabled=false where id=$1', [standard]);
    await as(standard);
    assert.equal((await db.query('select * from public.patients')).rows.length, 0);
  });
  await scenario('Compras no consecutivas y tercer mes fuera del primer ciclo', async () => {
    const p = await patient();
    await sales(p.id, ['2024-01', '2024-05', '2024-09']);
    const late = await patient('000222');
    await sales(late.id, ['2024-01', '2024-06', '2025-01']);
    await db.exec('reset role');
    assert.equal(await total('2024-12-31'), 40);
    assert.equal(
      Number(
        (
          await db.query<any>(
            `select coalesce(sum(amount),0) n from public.incentive_entitlements('2025-12-31') where patient_id=$1 and concept='CAPTACION'`,
            [late.id],
          )
        ).rows[0].n,
      ),
      0,
    );
    assert.equal(
      Number(
        (
          await db.query<any>(
            `select coalesce(sum(amount),0) n from public.incentive_entitlements('2025-12-31') where patient_id=$1 and concept='MANTENIMIENTO'`,
            [late.id],
          )
        ).rows[0].n,
      ),
      3.33,
    );
  });
  await scenario(
    'Los ajustes conservan el cierre y compensan pagos futuros sin duplicar derechos',
    async () => {
      const p = await patient();
      await sales(p.id, ['2024-01', '2024-02', '2024-03']);
      const close = async (start: string) => {
        const id = (await db.query<any>('select public.create_settlement($1) id', [start])).rows[0].id;
        const preview = (await db.query<any>('select public.settlement_preview($1) v', [id])).rows[0].v;
        await db.query('select public.approve_settlement($1,$2)', [id, preview.signature]);
        return id;
      };
      const first = await close('2024-01-01');
      const frozen = JSON.stringify(
        (await db.query<any>('select snapshot from public.settlements where id=$1', [first])).rows[0]
          .snapshot,
      );
      await db.query('select public.record_payment($1,$2,public.today_madrid(),null)', [first, employees[0]]);
      await save('patients', { kind: 'PROPIO' }, p.id, 1);
      for (const m of ['04', '05', '06', '07', '08', '09'])
        await save('monthly_reviews', { patient_id: p.id, month: `2024-${m}-01`, status: 'SIN_COMPRA' });
      await close('2024-04-01');
      assert.equal(
        Number(
          (await db.query<any>('select public.financial_summary() v')).rows[0].v.balances.find(
            (b: any) => b.employee_id === employees[0],
          ).outstanding,
        ),
        -5,
      );
      const next = await patient('000222', 'NUEVO', 'MOSTRADOR', '2024-07-01');
      await sales(next.id, ['2024-07', '2024-08', '2024-09']);
      const third = await close('2024-07-01');
      await db.query('select public.record_payment($1,$2,public.today_madrid(),null)', [third, employees[0]]);
      assert.equal(
        Number(
          (
            await db.query<any>('select sum(amount) n from public.payments where employee_id=$1', [
              employees[0],
            ])
          ).rows[0].n,
        ),
        11,
      );
      assert.equal(
        JSON.stringify(
          (await db.query<any>('select snapshot from public.settlements where id=$1', [first])).rows[0]
            .snapshot,
        ),
        frozen,
      );
    },
  );
  await scenario('Exportación y restauración atómica conservan cálculos e identificadores', async () => {
    const p = await patient();
    await sales(p.id, ['2024-01', '2024-02', '2024-03']);
    const snapshot = (await db.query<any>('select public.export_administrative_data() v')).rows[0].v;
    const restored = new PGlite();
    try {
      await restored.exec(
        `create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text);create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;`,
      );
      for (const f of (await readdir('supabase/migrations')).filter((f) => f.endsWith('.sql')).sort())
        await restored.exec(await readFile(`supabase/migrations/${f}`, 'utf8'));
      await restored.exec(
        `insert into auth.users(id) values('${owner}'),('${admin}'),('${standard}');set role service_role;`,
      );
      const result = (
        await restored.query<any>('select public.restore_administrative_data($1::jsonb) v', [
          JSON.stringify(snapshot),
        ])
      ).rows[0].v;
      assert.deepEqual(result, { patients: 1, employees: 5, sales: 3 });
      await restored.exec('reset role');
      assert.equal(
        Number(
          (await restored.query<any>(`select sum(amount) n from public.incentive_entitlements('2024-03-31')`))
            .rows[0].n,
        ),
        40,
      );
      assert.equal(
        (await restored.query<any>('select id,farmatic_code from public.patients')).rows[0].id,
        p.id,
      );
      assert.equal(
        (await restored.query<any>('select count(*) n from public.profiles where must_change_password'))
          .rows[0].n,
        3,
      );
      await restored.exec('set role authenticated');
      await assert.rejects(
        () =>
          restored.query('select public.restore_administrative_data($1::jsonb)', [JSON.stringify(snapshot)]),
        /permission/,
      );
    } finally {
      await restored.close();
    }
  });
  await scenario('Una baja anterior a una venta tras reactivación no adelanta el devengo', async () => {
    const p = await patient();
    await sales(p.id, ['2024-01', '2024-02']);
    await db.query(`select public.set_patient_status($1,1,'2024-03-01',false)`, [p.id]);
    await db.query(`select public.set_patient_status($1,2,'2024-03-05',true)`, [p.id]);
    await sales(p.id, ['2024-03']);
    await db.exec('reset role');
    assert.equal(await total('2024-03-15'), 0);
    assert.equal(await total('2024-03-31'), 40);
  });
  await scenario(
    'Contraseña temporal, privacidad financiera y protección de la última cuenta superpowers',
    async () => {
      const p = await patient();
      await sales(p.id, ['2024-01', '2024-02', '2024-03']);
      await as(standard);
      const summary = (await db.query<any>('select public.financial_summary() v')).rows[0].v;
      assert.equal(Number(summary.accrued), 8);
      assert.ok(summary.entitlements.every((r: any) => r.employee_id === employees[0]));
      await as(owner);
      await rejects(() => save('profiles', { role: 'administrador' }, owner, 1), /al menos una/);
      await db.query('select public.request_password_reset($1)', [standard]);
      await as(standard);
      assert.equal((await db.query('select * from public.patients')).rows.length, 0);
      await rejects(() => db.query('select public.financial_summary()'), /autorizado/);
    },
  );
  await scenario(
    'La corrección de un alta actualiza su periodo, exige administración y respeta las ventas',
    async () => {
      const p = await patient();
      await sales(p.id, ['2024-01']);
      await as(standard);
      await rejects(() => save('patients', { joined_on: '2023-12-01' }, p.id, 1), /administración/);
      await as(owner);
      await save('patients', { joined_on: '2023-12-01' }, p.id, 1);
      assert.equal(
        (
          await db.query<any>('select starts_on::text from public.patient_periods where patient_id=$1', [
            p.id,
          ])
        ).rows[0].starts_on,
        '2023-12-01',
      );
      await rejects(() => save('patients', { joined_on: '2024-01-11' }, p.id, 2), /ventas anteriores/);
    },
  );
  await db.close();
});

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { randomBytes } from 'node:crypto';
import { parseArgs } from 'node:util';
import { adminClient, authAccounts } from './admin-client';
async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: { file: { type: 'string' }, 'empty-target': { type: 'boolean', default: false } },
  });
  const command = positionals[0],
    client = adminClient();
  if (command === 'create') {
    const { data, error } = await client.rpc('administrative_snapshot');
    if (error) throw new Error('No se pudo crear la copia. Compruebe la credencial y las migraciones.');
    const users = await authAccounts(client);
    data.accounts = data.profiles.map((p: { id: string }) => {
      const user = users.find((u) => u.id === p.id);
      if (!user?.email) throw new Error('Falta una cuenta de acceso.');
      return { id: p.id, email: user.email };
    });
    const file = resolve(values.file ?? `backups/spd-${new Date().toISOString().replaceAll(':', '-')}.json`);
    await mkdir(dirname(file), { recursive: true, mode: 0o700 });
    await writeFile(file, JSON.stringify(data, null, 2), { mode: 0o600, flag: 'wx' });
    console.log(
      `Copia administrativa y mapa de accesos guardados en ${file}. No contiene contraseñas ni sesiones.`,
    );
  } else if (command === 'restore') {
    if (!values.file || !values['empty-target'])
      throw new Error(
        'Uso: pnpm backup restore --file copia.json --empty-target. Configure un proyecto DESTINO vacío.',
      );
    const data = JSON.parse(await readFile(resolve(values.file), 'utf8'));
    if (data.format_version !== 1 || !Array.isArray(data.accounts) || !Array.isArray(data.profiles))
      throw new Error(
        'Use una copia creada con esta utilidad; la exportación del navegador no incluye el mapa de accesos.',
      );
    const { data: profiles, error: lookup } = await client.from('profiles').select('id').limit(1);
    if (lookup || profiles?.length)
      throw new Error('Aplique las migraciones a un destino vacío, sin crear la primera cuenta.');
    const existing = await authAccounts(client);
    if (existing.length) throw new Error('El destino debe tener Auth vacío.');
    const created: string[] = [];
    let restored = false;
    try {
      for (const account of data.accounts) {
        const { error } = await client.auth.admin.createUser({
          id: account.id,
          email: account.email,
          email_confirm: true,
          password: randomBytes(32).toString('base64url'),
        });
        if (error) throw new Error('No se pudo recrear una cuenta de acceso.');
        created.push(account.id);
      }
      const { data: counts, error } = await client.rpc('restore_administrative_data', { p_data: data });
      if (error)
        throw new Error(
          'La restauración no pudo completarse. Compruebe que el destino está vacío y la copia está completa.',
        );
      restored = true;
      console.log(
        `Restauración completada: ${counts.patients} pacientes, ${counts.employees} empleadas y ${counts.sales} ventas.`,
      );
      console.log(
        'Use accounts recover para establecer contraseñas temporales. Los identificadores y repartos históricos se han conservado.',
      );
    } finally {
      if (!restored) for (const id of created) await client.auth.admin.deleteUser(id);
    }
  } else
    throw new Error(
      'Uso: pnpm backup create [--file copia.json] | pnpm backup restore --file copia.json --empty-target',
    );
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});

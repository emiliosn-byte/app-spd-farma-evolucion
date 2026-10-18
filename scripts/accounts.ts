import { parseArgs } from 'node:util';
import { z } from 'zod';
import { adminClient, authAccounts, passwordPrompt } from './admin-client';
async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: { email: { type: 'string' }, name: { type: 'string' } },
  });
  const command = positionals[0];
  if (!['bootstrap', 'recover'].includes(command))
    throw new Error(
      'Uso: pnpm accounts bootstrap --email correo --name Nombre | pnpm accounts recover --email correo',
    );
  const email = z.email().parse(values.email),
    client = adminClient();
  if (command === 'bootstrap') {
    const name = z.string().trim().min(1).max(100).parse(values.name);
    const { data: existing, error: lookup } = await client
      .from('profiles')
      .select('id')
      .eq('role', 'superpowers')
      .eq('enabled', true)
      .limit(1);
    if (lookup) throw new Error('Aplique primero las migraciones.');
    if (existing?.length) throw new Error('Ya existe superpowers. Cree nuevas cuentas desde la aplicación.');
    const password = await passwordPrompt();
    const { data, error } = await client.auth.admin.createUser({ email, password, email_confirm: true });
    if (error || !data.user) throw new Error('No se pudo crear la cuenta de acceso.');
    const { error: profile } = await client
      .from('profiles')
      .insert({ id: data.user.id, display_name: name, role: 'superpowers', must_change_password: true });
    if (profile) {
      await client.auth.admin.deleteUser(data.user.id);
      throw new Error('No se pudo crear el perfil.');
    }
    console.log('Primera cuenta creada. Cambie la contraseña temporal al iniciar sesión.');
  } else {
    const user = (await authAccounts(client)).find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (!user) throw new Error('No existe una cuenta con ese correo.');
    const password = await passwordPrompt();
    const { error: flag } = await client
      .from('profiles')
      .update({ must_change_password: true })
      .eq('id', user.id);
    if (flag) throw new Error('No se pudo preparar la recuperación.');
    const { error } = await client.auth.admin.updateUserById(user.id, { password });
    if (error) throw new Error('No se pudo actualizar la contraseña.');
    console.log('Contraseña temporal actualizada. No se han enviado correos.');
  }
}
main().catch((error) => {
  console.error(error instanceof z.ZodError ? 'Revise el correo y el nombre.' : error.message);
  process.exitCode = 1;
});

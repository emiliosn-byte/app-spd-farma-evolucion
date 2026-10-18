import { createClient } from '@supabase/supabase-js';
export function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
    key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key)
    throw new Error('Configure NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en el entorno.');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
export async function passwordPrompt() {
  if (!process.stdin.isTTY)
    throw new Error('La contraseña se introduce en una terminal interactiva; no se acepta como argumento.');
  process.stdout.write('Contraseña temporal (mínimo 12 caracteres, entrada oculta): ');
  const password = await new Promise<string>((resolve, reject) => {
    let buffer = '';
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding('utf8');
    const finish = (error?: Error) => {
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdin.removeListener('data', listener);
      process.stdout.write('\n');
      if (error) reject(error);
      else resolve(buffer);
    };
    const listener = (chunk: string) => {
      for (const char of chunk) {
        if (char === '\u0003') {
          finish(new Error('Operación cancelada'));
          return;
        }
        if (char === '\r' || char === '\n') {
          finish();
          return;
        }
        if (char === '\u007f' || char === '\b') buffer = buffer.slice(0, -1);
        else if (char >= ' ') buffer += char;
      }
    };
    process.stdin.on('data', listener);
  });
  if (password.length < 12 || password.length > 128)
    throw new Error('Use una contraseña de entre 12 y 128 caracteres.');
  return password;
}
export async function authAccounts(client: ReturnType<typeof adminClient>) {
  const users = [];
  for (let page = 1; page < 1000; page++) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error('No se pudo consultar Auth.');
    users.push(...data.users);
    if (data.users.length < 200) return users;
  }
  throw new Error('Demasiadas cuentas para esta utilidad.');
}

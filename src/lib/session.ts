import 'server-only';
import { cache } from 'react';
import { redirect } from 'next/navigation';
import { configured, supabase } from './supabase';
import type { Profile } from './types';
export const getSession = cache(async () => {
  if (!configured())
    return {
      preview: true,
      profile: {
        id: '',
        display_name: 'Tu farmacia',
        role: 'superpowers',
        enabled: true,
        employee_id: null,
        must_change_password: false,
        version: 0,
      } as Profile,
      client: null,
    };
  const client = await supabase();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) redirect('/login');
  const { data: profile } = await client.from('profiles').select('*').eq('id', user.id).single();
  if (!profile?.enabled) redirect('/login?error=Acceso%20no%20autorizado');
  return { preview: false, profile: profile as Profile, client };
});
export async function requireSession(allowPasswordChange = false) {
  const session = await getSession();
  if (!allowPasswordChange && session.profile.must_change_password) redirect('/cuenta');
  return session;
}

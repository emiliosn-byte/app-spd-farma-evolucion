import { loginAction } from '../actions';
import { Brand, Notice } from '@/components/shell';
import Link from 'next/link';
import { ArrowRight, ShieldCheck } from 'lucide-react';
export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const params = await searchParams;
  return (
    <main className="login-page" id="main-content">
      <div className="login-story">
        <Brand />
        <div>
          <span className="eyebrow">FARMACIA EVOLUCIÓN</span>
          <h1>
            Cuidar mejor.
            <br />
            Avanzar <em>juntas.</em>
          </h1>
          <p>Un espacio para dar continuidad al servicio SPD y reconocer el trabajo de todo el equipo.</p>
        </div>
        <span className="login-foot">Organización, seguimiento y confianza.</span>
      </div>
      <div className="login-form-panel">
        <div className="login-card">
          <span className="login-icon">
            <ShieldCheck size={25} />
          </span>
          <h2>Bienvenida a tu espacio</h2>
          <p>Accede con tu cuenta de la farmacia.</p>
          <Notice {...params} />
          <form action={loginAction}>
            <label className="field">
              <span>Correo electrónico</span>
              <input name="email" type="email" autoComplete="username" required placeholder="tu@correo.es" />
            </label>
            <label className="field">
              <span>Contraseña</span>
              <input name="password" type="password" autoComplete="current-password" required />
            </label>
            <button className="button primary">
              Entrar <ArrowRight size={16} />
            </button>
          </form>
          <p className="login-help">
            Si necesitas recuperar tu acceso, contacta con el titular. No se envían correos de recuperación.
          </p>
          <Link className="text-link" href="/">
            Volver al inicio
          </Link>
        </div>
      </div>
    </main>
  );
}

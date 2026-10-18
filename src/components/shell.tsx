import Link from 'next/link';
import {
  LayoutDashboard,
  UsersRound,
  ClipboardList,
  ShoppingBag,
  Wallet,
  Settings2,
  ArrowUpRight,
  LogOut,
  HeartPulse,
  ShieldCheck,
} from 'lucide-react';
import { logoutAction } from '@/app/actions';
import { formatDate, todayMadrid } from '@/lib/dates';
import type { Profile } from '@/lib/types';
const navigation = [
  { href: '/', label: 'Resumen', icon: LayoutDashboard },
  { href: '/interesados', label: 'Interesados', icon: UsersRound },
  { href: '/pacientes', label: 'Pacientes', icon: ClipboardList },
  { href: '/ventas', label: 'Ventas y compras', icon: ShoppingBag },
  { href: '/liquidaciones', label: 'Liquidaciones', icon: Wallet },
  { href: '/configuracion', label: 'Configuración', icon: Settings2 },
];
export function Brand() {
  return (
    <div className="brand">
      <span className="brand-mark">
        <HeartPulse size={24} strokeWidth={1.7} />
      </span>
      <span>
        evolución<small>FARMACIA · SPD</small>
      </span>
    </div>
  );
}
export function Shell({
  profile,
  preview,
  current,
  children,
}: {
  profile: Profile;
  preview: boolean;
  current: string;
  children: React.ReactNode;
}) {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link href="/" aria-label="Farmacia Evolución, resumen">
          <Brand />
        </Link>
        <div className="workspace-label">TU ESPACIO DE TRABAJO</div>
        <nav aria-label="Navegación principal">
          {navigation
            .filter((n) => n.href !== '/configuracion' || profile.role !== 'estandar')
            .map((n) => (
              <Link
                key={n.href}
                href={n.href}
                className={`nav-item ${current === n.href ? 'active' : ''}`}
                aria-current={current === n.href ? 'page' : undefined}
              >
                <n.icon size={19} />
                <span>
                  {n.href === '/liquidaciones' && profile.role === 'estandar' ? 'Mis incentivos' : n.label}
                </span>
                {current === n.href && <span className="nav-dot" />}
              </Link>
            ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-note">
            <ShieldCheck size={20} />
            <div>
              Un cuidado que continúa.<small>Un equipo que avanza.</small>
            </div>
          </div>
          <div className="sidebar-date">
            {formatDate(todayMadrid())}
            <span>Europe / Madrid</span>
          </div>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <span className="breadcrumb">
            Farmacia Evolución <span>/</span> Gestión SPD
          </span>
          <div className="topbar-right">
            <span className="private-label">
              <i />
              {preview ? 'Vista previa' : 'Espacio privado'}
            </span>
            <Link className="account-link" href="/cuenta">
              <span className="avatar">{profile.display_name.slice(0, 2).toUpperCase()}</span>
              <span>
                {profile.display_name}
                <small>
                  {profile.role === 'superpowers'
                    ? 'Superpowers'
                    : profile.role === 'administrador'
                      ? 'Administración'
                      : 'Equipo'}
                </small>
              </span>
            </Link>
            <form action={logoutAction}>
              <button className="icon-button" aria-label="Cerrar sesión">
                <LogOut size={18} />
              </button>
            </form>
          </div>
        </header>
        <main id="main-content">
          {preview && (
            <div className="preview-banner">
              <span>
                <strong>Vista previa sin conexión.</strong> No guarda datos. Conecta Supabase para activar la
                aplicación.
              </span>
              <Link href="/configuracion">
                Ver configuración <ArrowUpRight size={14} />
              </Link>
            </div>
          )}
          {children}
        </main>
        <footer className="footer">
          <span>
            Farmacia Evolución <span>·</span> Gestión del servicio SPD
          </span>
          <span>Datos administrativos · Información clínica en Farmatic</span>
        </footer>
      </div>
    </div>
  );
}
export function PageHeader({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {children && <div className="page-actions">{children}</div>}
    </div>
  );
}
export function Notice({ error, success }: { error?: string; success?: string }) {
  return (
    <>
      {error && (
        <div className="notice error" role="alert">
          {error}
        </div>
      )}
      {success && (
        <div className="notice success" role="status">
          {success}
        </div>
      )}
    </>
  );
}
export function Empty({
  title,
  description,
  icon: Icon = ClipboardList,
}: {
  title: string;
  description: string;
  icon?: typeof ClipboardList;
}) {
  return (
    <div className="empty-state">
      <span className="empty-icon">
        <Icon size={25} strokeWidth={1.4} />
      </span>
      <h3>{title}</h3>
      <p>{description}</p>
    </div>
  );
}
export function Badge({ children, tone = 'neutral' }: { children: React.ReactNode; tone?: string }) {
  return <span className={`badge ${tone}`}>{children}</span>;
}

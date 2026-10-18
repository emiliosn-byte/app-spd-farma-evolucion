import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: 'Evolución · Gestión SPD',
  description: 'Gestión administrativa del servicio SPD de Farmacia Evolución',
  robots: { index: false, follow: false },
};
export const dynamic = 'force-dynamic';
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" data-scroll-behavior="smooth">
      <body>
        <a className="skip-link" href="#main-content">
          Saltar al contenido
        </a>
        {children}
      </body>
    </html>
  );
}

import Link from 'next/link';
export default function NotFound() {
  return (
    <main className="error-page">
      <h1>Esta página no existe</h1>
      <Link href="/" className="button primary">
        Volver al resumen
      </Link>
    </main>
  );
}

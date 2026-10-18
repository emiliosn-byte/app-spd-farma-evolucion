'use client';
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="error-page">
      <h1>No hemos podido cargar el espacio</h1>
      <p>Comprueba la conexión con Supabase y que las migraciones estén aplicadas.</p>
      <button className="button primary" onClick={reset}>
        Volver a intentar
      </button>
    </main>
  );
}

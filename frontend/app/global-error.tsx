'use client';

/** Required for root-level error handling in Next.js App Router */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="ru">
      <body>
        <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, fontFamily: 'system-ui' }}>
          <h1 style={{ fontSize: 20, marginBottom: 8 }}>Ошибка</h1>
          <p style={{ fontSize: 14, color: '#666', marginBottom: 24 }}>{error.message}</p>
          <button onClick={() => reset()} style={{ padding: '10px 20px', background: '#2563eb', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer' }}>
            Повторить
          </button>
        </div>
      </body>
    </html>
  );
}

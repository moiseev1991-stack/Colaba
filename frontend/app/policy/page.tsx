import Link from 'next/link';

export default function PolicyPage() {
  return (
    <div className="min-h-screen p-6 max-w-3xl mx-auto">
      <h1
        className="font-display font-semibold tracking-tight text-2xl mb-4"
        style={{ color: 'hsl(var(--text))' }}
      >
        Политика конфиденциальности
      </h1>
      <p className="text-sm mb-6" style={{ color: 'hsl(var(--muted))' }}>
        Текст политики конфиденциальности SpinLid. Здесь будут условия использования и обработки данных.
      </p>
      <Link
        href="/"
        className="text-sm text-brand-600 dark:text-brand-400 hover:underline"
      >
        ← На главную
      </Link>
    </div>
  );
}

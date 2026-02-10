import Link from 'next/link';

export default function PolicyPage() {
  return (
    <div className="min-h-screen p-6 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Политика конфиденциальности</h1>
      <p className="text-gray-600 dark:text-gray-400 text-sm mb-6">
        Текст политики конфиденциальности SpinLid. Здесь будут условия использования и обработки данных.
      </p>
      <Link href="/" className="text-sm text-saas-primary hover:underline">← На главную</Link>
    </div>
  );
}

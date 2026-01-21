/**
 * Home page (Frame 1 — "Ввод").
 * 
 * Основной экран с полем ввода запроса и превью режимов работы.
 */

import SearchForm from '@/components/SearchForm';

export default function HomePage() {
  return (
    <div className="min-h-screen bg-gray-900">
      {/* Hero блок */}
      <header className="bg-red-600 h-[200px] flex items-center px-4">
        <div className="container mx-auto">
          <h1 className="text-white text-2xl font-bold">LeadGen Constructor</h1>
        </div>
      </header>

      {/* Контент */}
      <main className="container mx-auto px-4 py-8">
        {/* Заголовок */}
        <h2 className="text-4xl font-bold text-white mb-8">Ввод</h2>

        {/* Поле ввода */}
        <SearchForm />

        {/* Превью/режимы */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 max-w-5xl">
          {/* Режим "для лидов" */}
          <div className="bg-blue-600 h-32 rounded-lg flex items-center justify-center">
            <span className="text-white text-sm">для лидов</span>
          </div>

          {/* Режим "для SEO" */}
          <div className="bg-blue-600 h-32 rounded-lg flex items-center justify-center">
            <span className="text-white text-sm">для SEO</span>
          </div>

          {/* Режим "для цен" */}
          <div className="bg-gray-700 h-32 rounded-lg flex items-center justify-center opacity-50">
            <span className="text-gray-400 text-sm">для цен (скоро)</span>
          </div>
        </div>
      </main>
    </div>
  );
}

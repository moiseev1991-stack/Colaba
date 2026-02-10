'use client';

export function HeroHeader() {
  return (
    <div className="max-w-[1250px] mx-auto px-4 md:px-6">
      <header className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-[14px] shadow-sm flex items-center gap-4 px-4 py-4 md:py-5">
        {/* Logo placeholder 32–36px */}
        <div className="w-9 h-9 flex-shrink-0 rounded-[10px] bg-saas-primary-weak flex items-center justify-center" aria-hidden>
          <span className="text-saas-primary font-bold text-sm">S</span>
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-gray-900 dark:text-white text-xl md:text-2xl font-bold truncate">SpinLid</h1>
          <p className="text-gray-600 dark:text-gray-400 text-xs md:text-sm mt-0.5 hidden sm:block">
            Конструктор лидов для SEO-аудита и поиска контактов
          </p>
        </div>
      </header>
    </div>
  );
}

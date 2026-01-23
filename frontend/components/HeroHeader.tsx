'use client';

export function HeroHeader() {
  return (
    <div className="max-w-[1250px] mx-auto px-6">
      <header className="bg-red-600 h-[70px] flex items-center px-4 rounded-lg">
        <div className="w-full">
          <h1 className="text-white text-2xl md:text-3xl font-bold">SpinLid</h1>
          <p className="text-white/90 text-sm">Конструктор лидов для SEO-аудита и поиска контактов</p>
        </div>
      </header>
    </div>
  );
}

'use client';

export function HeroHeader() {
  return (
    <header className="w-full bg-red-600 h-[70px] flex items-center px-4">
      <div className="container mx-auto max-w-6xl">
        <h1 className="text-white text-2xl md:text-3xl font-bold">SpinLid</h1>
        <p className="text-white/90 text-sm">Конструктор лидов для SEO-аудита и поиска контактов</p>
      </div>
    </header>
  );
}

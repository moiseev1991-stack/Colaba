'use client';

export function HeroHeader() {
  return (
    <header className="w-full bg-red-600 h-[140px] flex items-center px-4">
      <div className="container mx-auto max-w-6xl">
        <h1 className="text-white text-4xl md:text-5xl font-bold mb-2">SpinLid</h1>
        <p className="text-white/90 text-lg">Конструктор лидов для SEO-аудита и поиска контактов</p>
      </div>
    </header>
  );
}

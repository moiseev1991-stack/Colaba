'use client';

// §4.19 ТЗ редизайна 2026-06-03 (Phase C batch 9): HeroHeader на v2 — бренд-логотип.

export function HeroHeader() {
  return (
    <div className="max-w-[1250px] mx-auto px-4 md:px-6">
      <header
        className="rounded-v2-lg border shadow-v2-sm flex items-center gap-4 px-4 py-4 md:py-5"
        style={{ background: 'hsl(var(--surface))', borderColor: 'hsl(var(--border))' }}
      >
        {/* Logo placeholder 32–36px */}
        <div
          className="w-9 h-9 flex-shrink-0 rounded-v2-sm bg-brand-gradient shadow-v2-sm flex items-center justify-center"
          aria-hidden
        >
          <span className="text-white font-bold text-sm">S</span>
        </div>
        <div className="min-w-0 flex-1">
          <h1
            className="font-display font-semibold tracking-tight text-xl md:text-2xl truncate"
            style={{ color: 'hsl(var(--text))' }}
          >
            SpinLid
          </h1>
          <p
            className="text-xs md:text-sm mt-0.5 hidden sm:block"
            style={{ color: 'hsl(var(--muted))' }}
          >
            Конструктор лидов для SEO-аудита и поиска контактов
          </p>
        </div>
      </header>
    </div>
  );
}

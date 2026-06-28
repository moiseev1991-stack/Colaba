'use client';

/**
 * MobileNav — бургер-кнопка в шапке + выдвижное полное меню для мобайла.
 *
 * Зачем: на <md сайдбар полностью скрыт (см. AppLayout), а нижний
 * MobileTabBar даёт лишь 4 пункта (Поиск/Дашборд/Кампании/Профиль). Из-за
 * этого с телефона были недостижимы История, Шаблоны КП, Пресеты, Списки,
 * Ответы, Статистика, Настройки, Админ. Этот drawer повторяет полную
 * навигацию активного модуля (MODULE_NAV из Sidebar) и закрывает дыру.
 *
 * Рендерится внутри AppHeader (внутри ModuleProvider), поэтому useModule()
 * доступен. На десктопе скрыт (md:hidden) — там работает Sidebar.
 */

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, X } from 'lucide-react';
import { useModule, MODULE_LABELS } from '@/lib/ModuleContext';
import {
  MODULE_NAV,
  ADMIN_SECTION,
  MODULE_ICONS,
  getBestMatch,
} from './Sidebar';

const LEGAL_LINKS = [
  { href: '/terms', label: 'Соглашение' },
  { href: '/policy', label: 'Политика' },
  { href: '/offer', label: 'Оферта' },
];
const SUPPORT_EMAIL = 'support@spinlid.ru';

const focusClass =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--nav-focus-ring))] focus-visible:ring-offset-2 rounded-[8px]';

export function MobileNav() {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [isSuperuser, setIsSuperuser] = useState(false);
  const pathname = usePathname();
  const { module } = useModule();
  const ModuleIcon = MODULE_ICONS[module];
  const config = MODULE_NAV[module];

  useEffect(() => {
    setMounted(true);
  }, []);

  // is_superuser — тот же контракт, что и в Sidebar: кэшируем только
  // положительный флаг в sessionStorage, чтобы случайная 401 не прятала
  // «Админ» до перезагрузки вкладки.
  useEffect(() => {
    const cached =
      typeof window !== 'undefined'
        ? sessionStorage.getItem('is_superuser')
        : null;
    if (cached === 'true') {
      setIsSuperuser(true);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/v1/auth/me', { cache: 'no-store' });
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (!cancelled && Boolean(data?.is_superuser)) {
          setIsSuperuser(true);
          try {
            sessionStorage.setItem('is_superuser', 'true');
          } catch {
            /* no-op */
          }
        }
      } catch {
        /* offline / no auth — просто не покажем admin-секцию */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Esc закрывает; пока открыт — блокируем скролл body, чтобы под drawer'ом
  // не «протекала» страница.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  const sections = isSuperuser
    ? [...config.sections, ADMIN_SECTION]
    : config.sections;
  const allItems = sections.flatMap((s) => s.items);
  const bestMatch = getBestMatch(pathname, allItems);

  const drawer =
    open && mounted
      ? createPortal(
          <div className="md:hidden fixed inset-0 z-[9998]">
            {/* Backdrop */}
            <div
              className="absolute inset-0 bg-slate-900/40"
              onClick={() => setOpen(false)}
              aria-hidden
            />
            {/* Panel */}
            <aside
              role="dialog"
              aria-label="Меню"
              className="absolute inset-y-0 left-0 flex w-[82%] max-w-[320px] flex-col border-r shadow-2xl"
              style={{
                backgroundColor: 'hsl(var(--surface))',
                borderColor: 'hsl(var(--border))',
              }}
            >
              <div
                className="flex h-14 shrink-0 items-center justify-between gap-2 border-b px-4"
                style={{ borderColor: 'hsl(var(--border))' }}
              >
                <span className="inline-flex items-center gap-2 text-[14px] font-semibold" style={{ color: 'hsl(var(--text))' }}>
                  <span
                    className="flex h-7 w-7 items-center justify-center rounded-[8px]"
                    style={{ background: 'var(--brand-gradient)', color: 'white' }}
                    aria-hidden
                  >
                    <ModuleIcon className="h-4 w-4" />
                  </span>
                  {MODULE_LABELS[module]}
                </span>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className={`flex h-9 w-9 items-center justify-center rounded-[8px] transition-colors hover:bg-[hsl(var(--nav-hover-bg))] ${focusClass}`}
                  aria-label="Закрыть меню"
                  style={{ color: 'hsl(var(--nav-text))' }}
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <nav className="flex-1 overflow-y-auto px-3 py-4" aria-label={MODULE_LABELS[module]}>
                {sections.map((section, sectionIdx) => (
                  <div key={sectionIdx} className={sectionIdx > 0 ? 'mt-5' : ''}>
                    {section.title && (
                      <div
                        className="mb-2 px-3 py-1 text-[11px] font-bold uppercase tracking-wider"
                        style={{ color: 'hsl(var(--accent))' }}
                      >
                        {section.title}
                      </div>
                    )}
                    <ul className="space-y-1">
                      {section.items.map((item) => {
                        const Icon = item.icon;
                        const active = item.href === bestMatch;
                        return (
                          <li key={item.href}>
                            <Link
                              href={item.href}
                              onClick={() => setOpen(false)}
                              className={`relative flex items-center gap-3 h-11 rounded-[8px] px-3 text-[15px] transition-all ${focusClass} ${
                                active
                                  ? 'font-semibold'
                                  : 'hover:bg-[hsl(var(--nav-hover-bg))] font-medium'
                              }`}
                              style={{
                                color: active
                                  ? 'hsl(var(--nav-active-text))'
                                  : 'hsl(var(--nav-text))',
                                background: active
                                  ? 'hsl(var(--nav-active-bg))'
                                  : undefined,
                              }}
                            >
                              {active && (
                                <span
                                  className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full"
                                  style={{ background: 'var(--brand-gradient)' }}
                                  aria-hidden
                                />
                              )}
                              <Icon
                                className="h-[18px] w-[18px] shrink-0"
                                style={{ color: active ? 'hsl(var(--accent))' : undefined }}
                                aria-hidden
                              />
                              <span>{item.label}</span>
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
              </nav>

              <div
                className="shrink-0 border-t px-4 py-3 text-[12px]"
                style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--muted))' }}
              >
                <div className="flex flex-wrap gap-x-3 gap-y-1">
                  {LEGAL_LINKS.map((l) => (
                    <Link
                      key={l.href}
                      href={l.href}
                      target="_blank"
                      onClick={() => setOpen(false)}
                      className="hover:underline"
                    >
                      {l.label}
                    </Link>
                  ))}
                </div>
                <a href={`mailto:${SUPPORT_EMAIL}`} className="mt-1.5 block hover:underline">
                  {SUPPORT_EMAIL}
                </a>
              </div>
            </aside>
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`md:hidden inline-flex h-9 w-9 items-center justify-center rounded-[8px] transition-colors hover:bg-[hsl(var(--nav-hover-bg))] ${focusClass}`}
        aria-label="Открыть меню"
        aria-expanded={open}
        style={{ color: 'hsl(var(--nav-text))' }}
      >
        <Menu className="h-5 w-5" />
      </button>
      {drawer}
    </>
  );
}

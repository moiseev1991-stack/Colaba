'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { ToastContainer, type Toast } from '@/components/Toast';
import { createSearch, listSearches } from '@/src/services/api/search';
import type { SearchResponse } from '@/src/services/api/search';
import {
  Loader2,
  ChevronDown,
  ChevronRight,
  Eye,
  Phone,
  Mail,
  Globe2,
  Sparkles,
  Users,
  ArrowRight,
  ArrowUpRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { CityCombobox } from '@/components/CityCombobox';
import { FilterBuilder, emptyFilterSpec } from '@/components/FilterBuilder';
import type { FilterSpec } from '@/components/FilterBuilder';
import { EmptyState } from '@/components/EmptyState';

const NICHE_PRESETS: Array<{ label: string; cat: string }> = [
  { label: 'строительные компании', cat: 'B2B' },
  { label: 'юридические услуги', cat: 'услуги' },
  { label: 'стоматология', cat: 'медицина' },
  { label: 'автосервис', cat: 'авто' },
  { label: 'доставка еды', cat: 'food' },
  { label: 'клининговая компания', cat: 'услуги' },
  { label: 'ремонт квартир', cat: 'строй' },
  { label: 'бухгалтерские услуги', cat: 'B2B' },
  { label: 'рекламное агентство', cat: 'B2B' },
  { label: 'фитнес клуб', cat: 'health' },
];

function formatRelative(iso: string): string {
  const d = new Date(iso).getTime();
  const diffMin = Math.round((Date.now() - d) / 60000);
  if (diffMin < 1) return 'только что';
  if (diffMin < 60) return `${diffMin} мин назад`;
  const diffH = Math.round(diffMin / 60);
  if (diffH < 24) return `${diffH} ч назад`;
  const diffD = Math.round(diffH / 24);
  if (diffD < 7) return `${diffD} дн назад`;
  return new Date(iso).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
}

function statusLabel(s: string): string {
  if (s === 'completed') return 'Готово';
  if (s === 'failed') return 'Ошибка';
  if (s === 'processing' || s === 'running') return 'В работе';
  return 'В очереди';
}

function statusBadgeClass(s: string): string {
  if (s === 'completed') return 'app-badge app-badge-success';
  if (s === 'failed') return 'app-badge app-badge-danger';
  if (s === 'processing' || s === 'running' || s === 'pending') return 'app-badge app-badge-warning';
  return 'app-badge app-badge-accent';
}

export default function LeadsPage() {
  const router = useRouter();
  const [keyword, setKeyword] = useState('');
  const [city, setCity] = useState('Москва');
  const [provider, setProvider] = useState('yandex_xml');
  const [depth, setDepth] = useState(50);
  const [filterPhone, setFilterPhone] = useState(true);
  // Structured filter (Wordstat-style). Sent as config.filters; the run page
  // applies it server-side via Postgres FTS + SQL filters.
  const [filterSpec, setFilterSpec] = useState<FilterSpec>(emptyFilterSpec);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [recentRuns, setRecentRuns] = useState<SearchResponse[]>([]);
  const [runsLoading, setRunsLoading] = useState(true);
  const [showAllPresets, setShowAllPresets] = useState(false);
  const recentRunsRef = useRef<HTMLElement | null>(null);

  const loadRecent = useCallback(async () => {
    setRunsLoading(true);
    try {
      const data = await listSearches({ limit: 6, offset: 0 });
      setRecentRuns(data.slice(0, 6));
    } catch {
      setRecentRuns([]);
    } finally {
      setRunsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRecent();
  }, [loadRecent]);

  const query = `${keyword.trim()} ${city}`.trim();
  const isValid = keyword.trim().length >= 3 && city && provider;

  const handlePreset = (niche: string) => setKeyword(niche);

  const handleSubmit = async () => {
    if (!isValid || isLoading) return;
    setIsLoading(true);
    try {
      // Strip empty/blank conditions before sending — they'd just be ignored
      // by the backend, but it's nicer to keep config.filters compact.
      const cleanedConditions = filterSpec.conditions.filter((c) => {
        if (c.op === 'is_true' || c.op === 'is_false') return true;
        return c.value && c.value.trim().length > 0;
      });
      const filtersPayload =
        cleanedConditions.length > 0
          ? { filters: { logic: filterSpec.logic, conditions: cleanedConditions } }
          : {};
      await createSearch({
        query,
        search_provider: provider,
        num_results: depth,
        config: {
          filter_phone: filterPhone,
          module: 'leads',
          ...filtersPayload,
        },
      });
      await loadRecent();
      setIsLoading(false);
      setToasts((p) => [
        ...p,
        { id: Date.now().toString(), type: 'success', message: 'Поиск запущен — следите за результатом ниже' },
      ]);
      // Scroll the recent-runs list into view so the user immediately sees
      // their freshly-launched search appear at the top.
      requestAnimationFrame(() => {
        recentRunsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    } catch (err: unknown) {
      setIsLoading(false);
      const msg =
        (err as { response?: { data?: { detail?: string } }; message?: string })?.response?.data?.detail ||
        (err as { message?: string })?.message ||
        'Ошибка при создании поиска';
      setToasts((p) => [...p, { id: Date.now().toString(), type: 'error', message: msg }]);
    }
  };

  const displayedPresets = showAllPresets ? NICHE_PRESETS : NICHE_PRESETS.slice(0, 6);

  const stats = useMemo(() => {
    const totalRuns = recentRuns.length;
    const totalLeads = recentRuns.reduce((sum, r) => sum + (r.result_count ?? 0), 0);
    return { totalRuns, totalLeads };
  }, [recentRuns]);

  const hasRuns = recentRuns.length > 0;

  return (
    <div className="mx-auto max-w-[1200px] px-6 py-10 relative z-10">
      {/* === HERO === */}
      <section className="mb-10 app-reveal">
        <div className="flex items-center gap-3 mb-5">
          <span className="app-live-dot" aria-hidden />
          <span className="app-mono-label" style={{ color: 'hsl(var(--accent))' }}>
            01 / Поиск лидов
          </span>
          <span className="app-mono-label" style={{ color: 'hsl(var(--muted))' }}>
            online · режим production
          </span>
        </div>
        <h1 className="text-[44px] md:text-[60px] font-extrabold leading-[0.98] tracking-[-2px] mb-5">
          Найдите <span className="app-hero-gradient">1 000 клиентов</span>
          <br className="hidden md:block" />
          <span className="md:inline"> </span>за 5 минут.
        </h1>
        <p className="text-[16px] md:text-[17px] max-w-[640px]" style={{ color: 'hsl(var(--muted))' }}>
          Введите нишу и город — получите телефоны, email и сайты компаний, готовых к рассылке.
          Первые 50 лидов — бесплатно.
        </p>

        {/* Live stats — only when there's data */}
        {hasRuns && (
          <div className="mt-7 grid grid-cols-2 md:grid-cols-4 gap-px bg-[hsl(var(--border))] rounded-[6px] overflow-hidden border border-[hsl(var(--border))]">
            <StatCell label="Лидов в базе" value={stats.totalLeads} accent />
            <StatCell label="Запусков" value={stats.totalRuns} />
            <StatCell label="Городов" value={new Set(recentRuns.map((r) => r.query.split(' ').slice(-1)[0])).size} />
            <StatCell label="Успешных" value={recentRuns.filter((r) => r.status === 'completed').length} />
          </div>
        )}
      </section>

      {/* === LAUNCH PANEL === */}
      <section className="app-hero-card mb-10 app-reveal app-reveal-delay-1">
        <div className="p-6 md:p-8">
          <div className="flex items-center justify-between mb-6 pb-5 border-b" style={{ borderColor: 'hsl(var(--border))' }}>
            <div className="flex items-center gap-3">
              <span className="app-step-num app-step-num-active">02</span>
              <div>
                <h2 className="text-[18px] font-bold leading-tight" style={{ color: 'hsl(var(--text))' }}>
                  Параметры запуска
                </h2>
                <p className="text-[12px] mt-0.5" style={{ color: 'hsl(var(--muted))' }}>
                  Заполните три поля — запустим поиск через секунду
                </p>
              </div>
            </div>
            <span className="app-mono-label hidden md:inline" style={{ color: 'hsl(var(--muted))' }}>
              ~ 60 сек до результата
            </span>
          </div>

          {/* Form row */}
          <div className="grid gap-4 md:grid-cols-12 mb-5">
            <div className="md:col-span-5">
              <label className="block app-mono-label mb-2" style={{ color: 'hsl(var(--muted))' }}>
                ниша / ключевое слово
              </label>
              <Input
                type="text"
                placeholder="Например: стоматология"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                disabled={isLoading}
                className="w-full h-11 text-[15px]"
                onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
              />
            </div>
            <div className="md:col-span-4">
              <label className="block app-mono-label mb-2" style={{ color: 'hsl(var(--muted))' }}>
                город
              </label>
              <CityCombobox
                city={city}
                onCityChange={(c) => setCity(c)}
                disabled={isLoading}
                className="w-full"
                placeholder="Выберите город"
              />
            </div>
            <div className="md:col-span-3">
              <label className="block app-mono-label mb-2" style={{ color: 'hsl(var(--muted))' }}>
                источник
              </label>
              <Select value={provider} onChange={(e) => setProvider(e.target.value)} disabled={isLoading} className="w-full h-11">
                <option value="yandex_xml">Яндекс XML</option>
                <option value="yandex_html">Яндекс</option>
                <option value="google_html">Google</option>
              </Select>
            </div>
          </div>

          {/* Niche presets */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <p className="app-mono-label" style={{ color: 'hsl(var(--muted))' }}>
                популярные ниши
              </p>
              <span className="app-mono-label" style={{ color: 'hsl(var(--muted))' }}>
                {showAllPresets ? NICHE_PRESETS.length : Math.min(6, NICHE_PRESETS.length)} / {NICHE_PRESETS.length}
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {displayedPresets.map((p) => {
                const active = keyword === p.label;
                return (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => handlePreset(p.label)}
                    className={cn('app-chip group', active && 'app-chip-active')}
                  >
                    <span>{p.label}</span>
                    <span
                      className={cn('app-bracket-tag', active && 'opacity-90')}
                      style={{ color: active ? 'rgba(255,255,255,0.85)' : undefined }}
                    >
                      {p.cat}
                    </span>
                  </button>
                );
              })}
              {NICHE_PRESETS.length > 6 && (
                <button
                  type="button"
                  onClick={() => setShowAllPresets(!showAllPresets)}
                  className="app-chip"
                  style={{ color: 'hsl(var(--accent))', fontWeight: 600 }}
                >
                  {showAllPresets ? '— Свернуть' : `+ ${NICHE_PRESETS.length - 6} ещё`}
                </button>
              )}
            </div>
          </div>

          {/* Advanced settings */}
          <div className="mb-6">
            <button
              type="button"
              onClick={() => setAdvancedOpen(!advancedOpen)}
              className="inline-flex items-center gap-1.5 app-mono-label hover:text-[hsl(var(--accent))] transition-colors"
              style={{ color: 'hsl(var(--muted))' }}
            >
              {advancedOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
              расширенные настройки
            </button>
            {advancedOpen && (
              <div
                className="mt-3 grid gap-4 p-4"
                style={{
                  background: 'hsl(var(--surface-2) / 0.5)',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: 4,
                }}
              >
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="block app-mono-label mb-1.5" style={{ color: 'hsl(var(--muted))' }}>
                      глубина поиска
                    </label>
                    <Select value={String(depth)} onChange={(e) => setDepth(Number(e.target.value))} className="w-full h-10">
                      {[10, 20, 50, 100].map((d) => (
                        <option key={d} value={d}>
                          Top {d}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer self-end mb-1">
                    <input
                      type="checkbox"
                      checked={filterPhone}
                      onChange={(e) => setFilterPhone(e.target.checked)}
                      className="w-4 h-4"
                      style={{ accentColor: 'hsl(var(--accent))' }}
                    />
                    <span className="text-[13px]" style={{ color: 'hsl(var(--text))' }}>
                      Только сайты с телефоном
                    </span>
                  </label>
                </div>

                {/* Wordstat-style condition builder. Saved in config.filters
                    and applied server-side via Postgres FTS + SQL on every
                    fetch of this search's results. */}
                <FilterBuilder
                  value={filterSpec}
                  onChange={setFilterSpec}
                  disabled={isLoading}
                />
              </div>
            )}
          </div>

          {/* CTA */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 pt-5 border-t" style={{ borderColor: 'hsl(var(--border))' }}>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!isValid || isLoading}
              className="app-cta-mega w-full sm:w-auto"
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" /> Запуск…
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" /> Найти лидов <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
            <div className="text-[13px] flex-1 leading-snug" style={{ color: 'hsl(var(--muted))' }}>
              {isValid ? (
                <>
                  <span className="app-mono-label" style={{ color: 'hsl(var(--accent))' }}>
                    →
                  </span>{' '}
                  Найдём <span style={{ color: 'hsl(var(--text))', fontWeight: 600 }}>top {depth}</span> компаний по запросу{' '}
                  <span style={{ color: 'hsl(var(--text))', fontWeight: 600 }}>«{query}»</span>
                </>
              ) : (
                <span className="app-mono-label" style={{ color: 'hsl(var(--muted))' }}>
                  введите нишу — минимум 3 символа
                </span>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* === WHAT YOU GET === */}
      <section className="mb-10 app-reveal app-reveal-delay-2">
        <div className="flex items-center gap-3 mb-4">
          <span className="app-step-num">03</span>
          <h2 className="text-[18px] font-bold" style={{ color: 'hsl(var(--text))' }}>
            Что вы получите
          </h2>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          <FeatureTile num="3.1" icon={<Phone className="h-4 w-4" />} title="Телефоны">
            Извлекаем мобильные и городские номера со страниц «Контакты» и «О нас»
          </FeatureTile>
          <FeatureTile num="3.2" icon={<Mail className="h-4 w-4" />} title="Email">
            Корпоративные info@/sales@/office@ — то, что юридически безопасно для cold outreach в РФ
          </FeatureTile>
          <FeatureTile num="3.3" icon={<Globe2 className="h-4 w-4" />} title="Сайты и формы">
            Ссылки на сайты и формы обратной связи — альтернативный канал, если email не доходит
          </FeatureTile>
        </div>
      </section>

      {/* === RECENT RUNS === */}
      <section ref={recentRunsRef} className="app-reveal app-reveal-delay-3" style={{ scrollMarginTop: 24 }}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <span className="app-step-num">04</span>
            <h2 className="text-[18px] font-bold" style={{ color: 'hsl(var(--text))' }}>
              Последние запуски
            </h2>
            {hasRuns && (
              <span className="app-bracket-tag" style={{ color: 'hsl(var(--muted))' }}>
                {recentRuns.length}
              </span>
            )}
          </div>
          {hasRuns && (
            <Link
              href="/app/leads/history"
              className="inline-flex items-center gap-1 app-mono-label transition-colors hover:text-[hsl(var(--accent))]"
              style={{ color: 'hsl(var(--muted))' }}
            >
              вся история <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          )}
        </div>

        {runsLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-[64px] app-skeleton" style={{ borderRadius: 4 }} />
            ))}
          </div>
        ) : !hasRuns ? (
          <EmptyState
            icon={<Users className="h-6 w-6" />}
            title="Запусков пока нет"
            description={
              <>
                Выберите нишу выше и нажмите{' '}
                <span style={{ color: 'hsl(var(--text))', fontWeight: 600 }}>«Найти лидов»</span> — первые результаты появятся через минуту.
              </>
            }
          />
        ) : (
          <div className="space-y-1.5">
            {recentRuns.map((r, idx) => (
              <button
                key={r.id}
                type="button"
                onClick={() => router.push(`/runs/${r.id}`)}
                className="app-run-card w-full text-left"
              >
                <span className="app-mono-label shrink-0 w-8 text-center" style={{ color: 'hsl(var(--muted))' }}>
                  #{String(idx + 1).padStart(2, '0')}
                </span>
                <div className="min-w-0">
                  <div className="text-[14px] font-semibold truncate" style={{ color: 'hsl(var(--text))' }} title={r.query}>
                    {r.query}
                  </div>
                  <div className="app-mono-label mt-0.5" style={{ color: 'hsl(var(--muted))' }}>
                    {formatRelative(r.created_at)} · {r.result_count ?? 0} {(r.result_count ?? 0) === 1 ? 'лид' : 'лидов'}
                  </div>
                </div>
                <span className={statusBadgeClass(r.status)}>{statusLabel(r.status)}</span>
                <div className="inline-flex items-center gap-1 text-[13px] font-semibold" style={{ color: 'hsl(var(--accent))' }}>
                  <Eye className="h-4 w-4" />
                  <span className="hidden sm:inline">Открыть</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </section>

      <ToastContainer toasts={toasts} onClose={(id) => setToasts((t) => t.filter((x) => x.id !== id))} />
    </div>
  );
}

function StatCell({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className="px-5 py-4" style={{ background: 'hsl(var(--surface))' }}>
      <div className={cn('app-mega-stat', accent && 'app-hero-gradient')} style={!accent ? { color: 'hsl(var(--text))' } : undefined}>
        {value}
      </div>
      <div className="app-mono-label mt-2" style={{ color: 'hsl(var(--muted))' }}>
        {label}
      </div>
    </div>
  );
}

function FeatureTile({ num, icon, title, children }: { num: string; icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="app-feature-tile">
      <div className="flex items-center justify-between">
        <div className="app-icon-glow">{icon}</div>
        <span className="app-feature-num">{num}</span>
      </div>
      <div>
        <div className="text-[15px] font-bold mb-1" style={{ color: 'hsl(var(--text))' }}>
          {title}
        </div>
        <div className="text-[13px] leading-snug" style={{ color: 'hsl(var(--muted))' }}>
          {children}
        </div>
      </div>
    </div>
  );
}

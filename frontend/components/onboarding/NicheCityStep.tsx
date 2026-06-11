'use client';

/**
 * Шаг 2 онбординга — «Где ищем клиентов?».
 *
 * Ниша + город. Под формой — 6 кликабельных примеров ниш. Каждый пример
 * заполняет поле «Ниша» одним кликом — юзер не должен думать, что ввести.
 *
 * Кнопка «Показать на примере» открывает demo-выдачу (ниша «стоматологии»,
 * крупный город) — для этого backend в `NEXT_PUBLIC_DEMO_SEARCH_ID` должен
 * содержать id заранее спарсенного поиска. Если переменная не задана —
 * кнопка скрыта (онбординг не ломается).
 */

import { ArrowRight, MapPin, Sparkles } from 'lucide-react';
import { useState } from 'react';

const NICHE_EXAMPLES = [
  'стоматологии',
  'автосервисы',
  'салоны красоты',
  'фитнес-клубы',
  'доставка еды',
  'ремонт квартир',
];

interface Props {
  initialNiche: string;
  initialCity: string;
  onSubmit: (niche: string, city: string) => void;
  onDemo: () => void;
  /** true если NEXT_PUBLIC_DEMO_SEARCH_ID задан и кнопка демо должна быть видна. */
  demoAvailable: boolean;
  submitting: boolean;
}

export function NicheCityStep({
  initialNiche,
  initialCity,
  onSubmit,
  onDemo,
  demoAvailable,
  submitting,
}: Props) {
  const [niche, setNiche] = useState(initialNiche);
  const [city, setCity] = useState(initialCity);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const n = niche.trim();
    const c = city.trim();
    if (!n || !c || submitting) return;
    onSubmit(n, c);
  }

  const valid = niche.trim().length > 0 && city.trim().length > 0;

  return (
    <div>
      <h2 className="text-[22px] font-semibold text-slate-900 dark:text-slate-100">
        Где ищем клиентов?
      </h2>
      <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
        Введите нишу и город. Соберём компании из 2GIS и Я.Карт, разберём
        их отзывы и найдём боли клиентов.
      </p>

      <form onSubmit={handleSubmit} className="mt-5 space-y-4">
        <div>
          <label className="mb-1 block text-[12px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Ниша
          </label>
          <input
            type="text"
            value={niche}
            onChange={(e) => setNiche(e.target.value)}
            placeholder="например: стоматологии"
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            autoFocus
          />
          <div className="mt-2 flex flex-wrap gap-1.5">
            <span className="text-[11px] text-slate-500 dark:text-slate-400">
              Примеры:
            </span>
            {NICHE_EXAMPLES.map((ex) => (
              <button
                key={ex}
                type="button"
                onClick={() => setNiche(ex)}
                className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11.5px] font-medium text-slate-700 hover:border-violet-400 hover:bg-violet-50 hover:text-violet-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-violet-900/30 dark:hover:text-violet-200"
              >
                {ex}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="mb-1 block text-[12px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Город
          </label>
          <div className="relative">
            <MapPin className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="например: Москва"
              className="w-full rounded-md border border-slate-300 bg-white py-2.5 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <button
            type="submit"
            disabled={!valid || submitting}
            className="inline-flex h-10 items-center gap-1.5 rounded-md bg-violet-600 px-5 text-sm font-semibold text-white shadow-sm hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? 'Запускаю поиск…' : 'Поехали'}
            <ArrowRight className="h-4 w-4" />
          </button>
          {demoAvailable && (
            <button
              type="button"
              onClick={onDemo}
              disabled={submitting}
              className="inline-flex h-10 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 hover:border-violet-400 hover:bg-violet-50 hover:text-violet-700 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-violet-900/30"
              title="Открыть готовый пример выдачи — стоматологии в крупном городе"
            >
              <Sparkles className="h-4 w-4 text-violet-600" />
              Показать на примере
            </button>
          )}
        </div>
      </form>
    </div>
  );
}

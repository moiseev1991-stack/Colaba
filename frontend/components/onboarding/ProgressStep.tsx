'use client';

/**
 * Шаг 3 онбординга — «Поехали». Экран прогресса, пока бэк парсит выдачу.
 *
 * Показываем юзеру осмысленное объяснение того, что происходит, чтобы
 * не казалось «зависло». Это просто визуальный feedback, никаких API-
 * запросов изнутри не делается — родительский OnboardingFlow создаёт
 * search и редиректит на /app/leads сразу после получения id (там и
 * рендерится живая лента карточек).
 *
 * Если ошибка — сюда передаётся текст ошибки + reset-колбэк.
 */

import { AlertCircle, Brain, Loader2, MapPin, Search } from 'lucide-react';

const STAGES = [
  { icon: <MapPin className="h-4 w-4" />, text: 'Собираем компании из 2GIS и Я.Карт' },
  { icon: <Search className="h-4 w-4" />, text: 'Подтягиваем сайты, телефоны и емейлы' },
  { icon: <Brain className="h-4 w-4" />, text: 'Анализируем отзывы и находим боли клиентов' },
];

interface Props {
  niche: string;
  city: string;
  error?: string | null;
  onRetry?: () => void;
}

export function ProgressStep({ niche, city, error, onRetry }: Props) {
  if (error) {
    return (
      <div>
        <h2 className="flex items-center gap-2 text-[22px] font-semibold text-rose-700 dark:text-rose-300">
          <AlertCircle className="h-6 w-6" />
          Не получилось запустить поиск
        </h2>
        <p className="mt-2 text-sm text-slate-700 dark:text-slate-300">{error}</p>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="mt-4 inline-flex h-10 items-center gap-1.5 rounded-md bg-violet-600 px-5 text-sm font-semibold text-white shadow-sm hover:bg-violet-700"
          >
            Попробовать ещё раз
          </button>
        )}
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-[22px] font-semibold text-slate-900 dark:text-slate-100">
        Ищем «{niche}» в городе {city}
      </h2>
      <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
        Обычно 30-90 секунд. Дальше всё произойдёт автоматически — карточки
        компаний начнут появляться в реальном времени.
      </p>

      <ul className="mt-6 space-y-3">
        {STAGES.map((s, i) => (
          <li
            key={i}
            className="flex items-start gap-3 rounded-md border border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900"
          >
            <div className="rounded-md bg-violet-100 p-1.5 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300">
              {s.icon}
            </div>
            <div className="flex-1 text-[13.5px] text-slate-800 dark:text-slate-200">
              {s.text}
            </div>
            <Loader2 className="mt-1 h-4 w-4 animate-spin text-violet-500" />
          </li>
        ))}
      </ul>
    </div>
  );
}

'use client';

/**
 * Шаг 4 онбординга — запуск первого поиска. Осмысленный статус, пока
 * создаётся search и происходит редирект на живую выдачу (там карточки
 * появляются в реальном времени со счётчиком «Уже найдено N»).
 *
 * Никаких API-запросов изнутри не делается — родительский OnboardingFlow
 * создаёт search и редиректит. Если ошибка — ErrorState + «Ещё раз».
 */

import { Brain, Loader2, MapPin, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ErrorState } from '@/components/ui/states';

const STAGES = [
  {
    icon: <MapPin className="h-4 w-4" />,
    text: 'Собираем компании с Яндекс.Карт, 2GIS и Google Карт',
  },
  { icon: <Search className="h-4 w-4" />, text: 'Подтягиваем сайты, телефоны и email' },
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
      <ErrorState
        title="Не получилось запустить поиск"
        description={error}
        action={
          onRetry ? (
            <Button type="button" variant="primary" size="sm" onClick={onRetry}>
              Попробовать ещё раз
            </Button>
          ) : undefined
        }
      />
    );
  }

  return (
    <div>
      <h2 className="text-heading font-extrabold tracking-tight text-ui-text">
        Запускаем «{niche}», {city}
      </h2>
      <p className="mt-1 text-sm text-ui-text-muted">
        Обычно 1–2 минуты. Сейчас переключим на живую выдачу — карточки компаний начнут появляться в
        реальном времени.
      </p>

      <ul className="mt-6 space-y-3">
        {STAGES.map((s, i) => (
          <li
            key={i}
            className="flex items-start gap-3 rounded-card border border-ui-border bg-ui-surface-2/50 px-4 py-2.5"
          >
            <div className="rounded-control bg-ui-accent/10 p-1.5 text-ui-accent">{s.icon}</div>
            <div className="flex-1 text-small text-ui-text">{s.text}</div>
            <Loader2 className="mt-1 h-4 w-4 animate-spin text-ui-accent" aria-hidden />
          </li>
        ))}
      </ul>
    </div>
  );
}

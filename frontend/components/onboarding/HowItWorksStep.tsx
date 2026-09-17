'use client';

/**
 * Шаг 3 онбординга (v2) — «Как это работает». Объясняющий экран перед
 * первым запуском: что соберём, сколько ждать, что получится на выходе.
 * Запуск — осознанный (кнопка здесь), а не внезапный редирект после
 * ввода ниши.
 */

import { FileText, MapPin, Brain } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props {
  niche: string;
  city: string;
  onLaunch: () => void;
  submitting: boolean;
}

const STEPS = [
  {
    icon: <MapPin className="h-5 w-5" />,
    title: 'Собираем компании',
    text: 'Карточки с Яндекс.Карт, 2GIS и Google Карт: название, адрес, телефон, сайт.',
  },
  {
    icon: <Brain className="h-5 w-5" />,
    title: 'Читаем отзывы',
    text: 'AI группирует жалобы клиентов в «боли» — с числом упоминаний и живой цитатой.',
  },
  {
    icon: <FileText className="h-5 w-5" />,
    title: 'Готовим письмо',
    text: 'Под каждую боль — черновик письма, который начинается с цитаты их же отзыва.',
  },
];

export function HowItWorksStep({ niche, city, onLaunch, submitting }: Props) {
  return (
    <div>
      <h2 className="text-heading font-extrabold tracking-tight text-ui-text">Как это работает</h2>
      <p className="mt-1 text-sm text-ui-text-muted">
        Запустим первый поиск:{' '}
        <b className="font-semibold text-ui-text">
          «{niche}», {city}
        </b>
        . Вот что произойдёт:
      </p>

      <ol className="mt-6 space-y-3">
        {STEPS.map((s, i) => (
          <li
            key={s.title}
            className="flex items-start gap-4 rounded-card border border-ui-border bg-ui-surface-2/50 px-4 py-3"
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-control bg-ui-accent/10 text-ui-accent">
              {s.icon}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-ui-text">
                <span className="mr-1.5 text-ui-text-muted">{String(i + 1).padStart(2, '0')}</span>
                {s.title}
              </p>
              <p className="mt-0.5 text-small text-ui-text-muted">{s.text}</p>
            </div>
          </li>
        ))}
      </ol>

      <div className="mt-6 rounded-card border border-ui-accent/20 bg-ui-accent/[.05] px-4 py-3 text-small text-ui-text-muted">
        Поиск займёт <b className="font-semibold text-ui-text">1–2 минуты</b>. Обычно находит от 30
        до 100 компаний — карточки начинают появляться сразу, ждать «до конца» не нужно.
      </div>

      <Button
        type="button"
        variant="primary"
        size="lg"
        className="mt-6 w-full"
        loading={submitting}
        onClick={onLaunch}
      >
        Запустить первый поиск
      </Button>
      <p className="mt-2 text-center text-small text-ui-text-muted">
        Или нажмите «Назад», чтобы изменить нишу и город
      </p>
    </div>
  );
}

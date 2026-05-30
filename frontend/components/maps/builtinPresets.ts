/**
 * Встроенные пресеты фильтров для модуля maps.
 *
 * Жёстко в коде (не в БД) — доступны всем юзерам всегда. Удалить нельзя.
 * Если набор будет сильно расти, переведём в БД-сид. Пока 5 — норм.
 *
 * Используются в двух местах:
 *  - MapsFiltersPanel (страница результатов) — клик применяет filter к текущей выдаче
 *  - MapsSearchForm (форма создания) — клик применяет filter к будущему поиску
 */

import type { MapSearchFilter } from '@/src/services/api/maps';

export type BuiltinPreset = {
  id: string;
  label: string;
  /** Полное описание — показывается в tooltip при наведении. */
  description: string;
  /** Короткая видимая подпись под названием — для быстрого скана глазами. */
  shortHint: string;
  filter: MapSearchFilter;
};

export const BUILTIN_PRESETS: BuiltinPreset[] = [
  {
    id: 'crisis',
    label: 'Кризис репутации',
    shortHint: 'для SMM / репутационщиков',
    description:
      'Для SMM-агентств и репутационщиков: много негатива, владелец не отвечает — компания «горит», ей нужно «спасти лицо»',
    filter: { min_negative: 10, has_owner_replies: false, sort_by: 'negative_desc' },
  },
  {
    id: 'falling',
    label: 'Падение рейтинга',
    shortHint: 'для SMM / SERM',
    description:
      'Для SMM/SERM: низкий рейтинг при достаточном числе отзывов — компания недавно «просела»',
    filter: { max_rating: 3.5, min_reviews: 10, sort_by: 'rating_asc' },
  },
  {
    id: 'need_website',
    label: 'Нужен сайт',
    shortHint: 'для веб-студий',
    description:
      'Для веб-студий и фрилансеров: компания живая (рейтинг ≥ 3.5, есть отзывы) — но сайта нет',
    filter: { has_website: false, min_rating: 3.5, min_reviews: 5, sort_by: 'reviews_desc' },
  },
  {
    id: 'chaos',
    label: 'Хаос в работе',
    shortHint: 'для CRM / автоматизаторов',
    description:
      'Для CRM/POS-вендоров и автоматизаторов: клиенты в отзывах жалуются на сбои процессов — «не дозвонился», «не перезвонили», «забыли про запись», «не подтвердили». Сигнал «нужна автоматизация».',
    filter: {
      review_text_contains_any: [
        'не дозвон',
        'не перезвон',
        'не ответ',
        'забыли',
        'не подтвердил',
        'не пришл',
      ],
      min_negative: 3,
      sort_by: 'negative_desc',
    },
  },
  {
    id: 'stable',
    label: 'Стабильный',
    shortHint: 'для cross-sell / upsell',
    description:
      'Высокий рейтинг, владелец отвечает — потенциально лояльные клиенты для cross-sell',
    filter: { min_rating: 4.3, min_reviews: 20, has_owner_replies: true, sort_by: 'rating_desc' },
  },
];

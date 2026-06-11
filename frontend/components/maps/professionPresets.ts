/**
 * Системные пресеты под профессии (Эпик C фокус-релиза «КП-конвейер»).
 *
 * Это chip-row над выдачей: «Для веб-студий / SEO / маркетологов».
 * В отличие от BUILTIN_PRESETS (сайдбар «Готовые пресеты» — конкретные
 * сценарии вроде «Кризис репутации»), эти пресеты — крупными мазками
 * под цель юзера. Один из chip'ов выбирается на онбординге (Эпик B)
 * и автоматически активируется при первом открытии выдачи.
 *
 * Логика «боль из кластеров записи/дозвона» (ТЗ §3 для webstudio) —
 * матчится на стороне фронта через PAIN_KEYWORD_DICT по подстрокам
 * лейблов pain-тегов. Из-за того, что MapSearchFilter работает как
 * AND (нельзя `has_website=false ИЛИ pain_tag_ids`), для MVP оставляем
 * только has_website=false + min_rating=3.5 — это самый сильный сигнал
 * для веб-студии. Pain-фильтр по словам — отдельный chip, при желании
 * юзер сам подкрутит.
 *
 * Для for_seo «отзывов < медианы ниши» требует backend-расчёта медианы —
 * на MVP опускаем, используем min_reviews=5. Аналогично for_marketing
 * «тренд негатива = rising» требует server-side фильтра — пока не
 * реализован, используем min_reviews ≥ 10 как сигнал «активный бизнес».
 *
 * Это компромисс для шага 5 порядка ТЗ. Полная реализация (включая
 * server-side трактовку OR-условий и трендовых фильтров) — после Эпика B.
 */

import type { MapSearchFilter } from '@/src/services/api/maps';

/** Словарь подстрок pain-label'ов для веб-студий. Конфиг, не хардкод
 *  в фильтре — ТЗ §3.
 *
 *  Сейчас используется только для подсветки релевантных pain-тегов
 *  при активном chip'е for_webstudio; не уходит в фильтр (см. комментарий
 *  выше). */
export const PAIN_KEYWORD_DICT_WEBSTUDIO = [
  'запис',   // «не записывают», «запись на приём»
  'дозвон',  // «не дозвониться»
  'телефон', // «не берут трубку», «телефон молчит»
  'ждать',   // «долго ждать ответ»
];

export type ProfessionPresetKey = 'for_webstudio' | 'for_seo' | 'for_marketing';

export interface ProfessionPreset {
  key: ProfessionPresetKey;
  label: string;
  /** Короткое пояснение для tooltip. */
  hint: string;
  /** Поля MapSearchFilter, которые chip выставляет при активации.
   *  При снятии chip'а каждое из этих полей переводится в null. */
  filter: Partial<MapSearchFilter>;
  /** Связанный template_key для KP-модалки (Эпик B/C: выбор профессии на
   *  онбординге → одновременно ставит chip и default-template_key). */
  kpTemplateKey: string;
}

export const PROFESSION_PRESETS: ProfessionPreset[] = [
  {
    key: 'for_webstudio',
    label: 'Для веб-студий',
    hint:
      'Живые компании без сайта (рейтинг ≥ 3.5). Готовая аудитория ' +
      'для предложения разработки сайта и формы записи.',
    filter: {
      has_website: false,
      min_rating: 3.5,
    },
    kpTemplateKey: 'webstudio',
  },
  {
    key: 'for_seo',
    label: 'Для SEO',
    hint:
      'Сайт есть, но рейтинг ниже 4.0 и достаточно отзывов — компании, ' +
      'у которых видимость и репутация просели. Кандидаты на работу ' +
      'с поиском и картами.',
    filter: {
      has_website: true,
      max_rating: 4.0,
      min_reviews: 5,
    },
    kpTemplateKey: 'seo',
  },
  {
    key: 'for_marketing',
    label: 'Для маркетологов',
    hint:
      'Активные компании (≥ 10 отзывов) с заметной долей негатива — ' +
      'кандидаты на удержание и привлечение клиентов.',
    filter: {
      min_reviews: 10,
      min_negative: 3,
    },
    kpTemplateKey: 'marketing',
  },
];

/** Ключи всех полей, которые могут выставляться chip'ами. При смене
 *  или снятии chip'а MapsSearchResults очищает именно эти поля, чтобы
 *  не унаследовать «хвост» от предыдущей профессии. */
export const PROFESSION_PRESET_FIELDS: (keyof MapSearchFilter)[] = [
  'has_website',
  'min_rating',
  'max_rating',
  'min_reviews',
  'min_negative',
];

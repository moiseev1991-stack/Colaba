/**
 * Человеческие подписи для поиска сайтов (режим «Сайты в Яндексе и Google»):
 * поисковик и условия отбора из config.filters. Общие для экрана результатов и «Истории».
 */

export type SiteCondition = { field: string; op: string; value?: string };

const PROVIDER_LABEL: Record<string, string> = {
  yandex_xml: 'Яндекс XML',
  yandex_html: 'Яндекс',
  google_html: 'Google',
};

const FIELD_LABEL: Record<string, string> = {
  text: 'текст страниц',
  title: 'текст страниц',
  meta: 'текст страниц',
  domain: 'домен',
};

const OP_LABEL: Record<string, string> = {
  contains: 'содержит',
  not_contains: 'не содержит',
  equals: '=',
  not_equals: '≠',
  starts_with: 'начинается с',
};

export function providerLabel(provider: string | null | undefined): string {
  return PROVIDER_LABEL[provider ?? ''] ?? provider ?? '';
}

export function describeCondition(c: SiteCondition): string {
  if (c.field === 'has_phone') return c.op === 'is_false' ? 'нет телефона' : 'есть телефон';
  if (c.field === 'has_email') return c.op === 'is_false' ? 'нет email' : 'есть email';
  return `${FIELD_LABEL[c.field] ?? c.field} ${OP_LABEL[c.op] ?? c.op} «${(c.value ?? '').trim()}»`;
}

/** Условия запуска из search.config: список и связка «и» / «или». */
export function searchConditions(config: unknown): {
  conditions: SiteCondition[];
  logic: 'and' | 'or';
} {
  const filters = (config as { filters?: { conditions?: unknown; logic?: unknown } } | null)
    ?.filters;
  return {
    conditions: Array.isArray(filters?.conditions) ? (filters!.conditions as SiteCondition[]) : [],
    logic: filters?.logic === 'or' ? 'or' : 'and',
  };
}

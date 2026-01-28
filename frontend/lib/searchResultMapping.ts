/**
 * Маппинг extra_data из SearchResult в SEOData и IssueCheck для LeadRow.
 */

import type { SEOData, IssueCheck } from './types';

export function mapExtraDataToSeo(
  extra_data: Record<string, unknown> | undefined | null
): SEOData | undefined {
  if (!extra_data) return undefined;

  const crawl = extra_data.crawl as { total_pages?: number; pages?: Array<{ status_code?: number }> } | undefined;
  const audit = extra_data.audit as { issues?: string[]; details?: Record<string, unknown> } | undefined;
  const issues = audit?.issues ?? [];
  const details = audit?.details ?? {};
  const pagesCrawled = (crawl?.total_pages ?? 0) as number;

  // По старой логике SEO-аудит запускается только по кнопке.
  // Если audit/details нет — возвращаем undefined, чтобы UI показывал нейтральное состояние (а не "ошибка").
  if (!audit?.details) {
    return undefined;
  }

  const robots: SEOData['robots'] = issues.includes('robots_disallow_all')
    ? 'Disallow:/'
    : issues.includes('no_robots_txt')
      ? 'не найден'
      : 'OK';

  const sitemap: SEOData['sitemap'] =
    issues.includes('no_sitemap_in_robots') || issues.includes('no_robots_txt') ? 'не найдена' : 'OK';

  const metaTitle: string =
    details.meta_title === 'empty' || !details.meta_title
      ? 'не найден'
      : String(details.meta_title ?? '-');

  const metaDesc: string =
    details.meta_description === 'empty' || !details.meta_description
      ? 'не найден'
      : String(details.meta_description ?? '-');

  let h1: string;
  if (issues.includes('no_h1')) {
    h1 = 'не найден';
  } else if (issues.includes('multiple_h1')) {
    h1 = details.h1_text ? `дублируется: ${String(details.h1_text)}` : 'дублируется';
  } else {
    h1 = details.h1_text ? String(details.h1_text) : '-';
  }

  const http = statusCodeToHttp(crawl?.pages?.[0]?.status_code);

  return {
    robots,
    sitemap,
    metaTitle,
    metaDesc,
    h1,
    http,
    pagesCrawled,
  };
}

function statusCodeToHttp(code: number | undefined): SEOData['http'] {
  if (code == null) return '200';
  if (code >= 200 && code < 300) return '200';
  if (code >= 300 && code < 400) return '3xx';
  if (code >= 400 && code < 500) return '4xx';
  if (code >= 500) return '5xx';
  return '200';
}

export function mapExtraDataToIssues(
  extra_data: Record<string, unknown> | undefined | null
): IssueCheck {
  const audit = extra_data?.audit as { issues?: string[] } | undefined;
  const issues = audit?.issues ?? [];

  return {
    // If audit hasn't been run yet, treat checks as OK (neutral) to avoid marking rows as errors.
    robots: !audit ? true : (!issues.includes('no_robots_txt') && !issues.includes('robots_disallow_all')),
    sitemap: !audit ? true : (!issues.includes('no_sitemap_in_robots') && !issues.includes('no_robots_txt')),
    titleDuplicates: true,
    descriptionDuplicates: true,
  };
}

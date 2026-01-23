/**
 * Генерация моковых данных для MVP
 */

import { LeadRow, IssueCheck, SEOData } from './types';

const MOCK_DOMAINS = [
  'example.com',
  'test-site.ru',
  'business-company.com',
  'service-provider.ru',
  'online-shop.com',
  'local-business.ru',
  'web-agency.com',
  'consulting-group.ru',
  'tech-startup.com',
  'marketing-agency.ru',
  'design-studio.com',
  'law-firm.ru',
  'medical-clinic.com',
  'education-center.ru',
  'restaurant-chain.com',
];

const MOCK_PHONES = [
  '+7 (495) 123-45-67',
  '+7 (812) 234-56-78',
  '+7 (343) 345-67-89',
  '+7 (391) 456-78-90',
  '+7 (831) 567-89-01',
  '+7 (846) 678-90-12',
  '+7 (383) 789-01-23',
  '+7 (351) 890-12-34',
  '8 (800) 123-45-67',
  '8 (800) 234-56-78',
  '8 (800) 345-67-89',
  '+7 (495) 987-65-43',
  '+7 (812) 876-54-32',
  null, // Some without phone
  null, // Some without phone
];

const MOCK_EMAILS = [
  'info@example.com',
  'contact@test-site.ru',
  'hello@business-company.com',
  'support@service-provider.ru',
  'sales@online-shop.com',
  'admin@local-business.ru',
  'info@domain.ru',
  'sales@domain.com',
  'contact@domain.ru',
  'support@domain.com',
  'hello@domain.ru',
  null, // Some without email
  null, // Some without email
];

function randomItem<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomBoolean(): boolean {
  return Math.random() > 0.5;
}

function randomIssueCheck(): IssueCheck {
  return {
    robots: randomBoolean(),
    sitemap: randomBoolean(),
    titleDuplicates: randomBoolean(),
    descriptionDuplicates: randomBoolean(),
  };
}

function generateSEOData(): SEOData {
  const robotsOptions: SEOData['robots'][] = ['OK', 'не найден', 'Disallow:/'];
  const sitemapOptions: SEOData['sitemap'][] = ['OK', 'не найдена'];
  const httpOptions: SEOData['http'][] = ['200', '3xx', '4xx', '5xx'];
  
  const metaTitleFound = Math.floor(Math.random() * 100);
  const metaTitleDuplicates = Math.floor(Math.random() * 50);
  const metaDescMissing = Math.floor(Math.random() * 100);
  const metaDescDuplicates = Math.floor(Math.random() * 50);
  const h1Missing = Math.floor(Math.random() * 100);
  const h1Duplicates = Math.floor(Math.random() * 50);
  
  return {
    robots: randomItem(robotsOptions),
    sitemap: randomItem(sitemapOptions),
    metaTitle: metaTitleDuplicates > 0 
      ? `найден ${metaTitleFound}% / дублируется ${metaTitleDuplicates}%`
      : `найден ${metaTitleFound}%`,
    metaDesc: metaDescDuplicates > 0
      ? `не найден ${metaDescMissing}% / дублируется ${metaDescDuplicates}%`
      : `не найден ${metaDescMissing}%`,
    h1: h1Duplicates > 0
      ? `не найден ${h1Missing}% / дублируется ${h1Duplicates}%`
      : `не найден ${h1Missing}%`,
    http: randomItem(httpOptions),
    pagesCrawled: Math.floor(Math.random() * 20) + 1,
  };
}

function hasBadIssue(issues: IssueCheck): boolean {
  return !issues.robots || !issues.sitemap || !issues.titleDuplicates || !issues.descriptionDuplicates;
}

function generateOutreachText(domain: string, issues: IssueCheck): string {
  const problems: string[] = [];
  if (!issues.robots) problems.push('отсутствует robots.txt');
  if (!issues.sitemap) problems.push('нет sitemap');
  if (!issues.titleDuplicates) problems.push('дублируются title');
  if (!issues.descriptionDuplicates) problems.push('дублируются description');
  
  const problemsText = problems.length > 0 
    ? problems.join(', ') 
    : 'есть небольшие улучшения';
  
  return `Здравствуйте! По вашему сайту ${domain} нашёл проблемы: ${problemsText}. Могу подсказать, что исправить в первую очередь.`;
}

export function generateMockResults(count: number = 20): LeadRow[] {
  const results: LeadRow[] = [];
  
  for (let i = 0; i < count; i++) {
    const domain = randomItem(MOCK_DOMAINS);
    const phone = randomItem(MOCK_PHONES);
    const email = randomItem(MOCK_EMAILS);
    const issues = randomIssueCheck();
    const hasError = hasBadIssue(issues);
    const score = Math.floor(Math.random() * 100);
    
    // 30% chance of error status
    const status: 'ok' | 'error' = (hasError && Math.random() > 0.7) ? 'error' : 'ok';
    
    results.push({
      id: `${Date.now()}-${i}`,
      domain,
      phone,
      email,
      score,
      issues,
      seo: generateSEOData(),
      status,
      outreachText: generateOutreachText(domain, issues),
    });
  }
  
  return results;
}

export function exportToCSV(results: LeadRow[]): string {
  const headers = ['Domain', 'Phone', 'Email', 'Score', 'Issues', 'Status'];
  const rows = results.map(row => {
    const issuesSummary = [
      row.issues.robots ? 'robots:ok' : 'robots:bad',
      row.issues.sitemap ? 'sitemap:ok' : 'sitemap:bad',
      row.issues.titleDuplicates ? 'title:ok' : 'title:bad',
      row.issues.descriptionDuplicates ? 'desc:ok' : 'desc:bad',
    ].join('; ');
    
    return [
      row.domain,
      row.phone || '',
      row.email || '',
      row.score,
      issuesSummary,
      row.status,
    ].map(cell => `"${cell}"`).join(',');
  });
  
  return [headers.join(','), ...rows].join('\n');
}

export function downloadCSV(content: string, filename: string): void {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * Экспорт таблицы в CSV и скачивание файла.
 */

type ExportRow = {
  domain: string;
  phone?: string | null;
  email?: string | null;
  score?: number;
  issues?: { robots?: boolean; sitemap?: boolean; titleDuplicates?: boolean; descriptionDuplicates?: boolean };
  status?: string;
};

export function exportToCSV(results: ExportRow[]): string {
  const headers = ['Domain', 'Phone', 'Email', 'Score', 'Issues', 'Status'];
  const rows = results.map((row) => {
    const issues = row.issues
      ? [
          row.issues.robots ? 'robots:ok' : 'robots:bad',
          row.issues.sitemap ? 'sitemap:ok' : 'sitemap:bad',
          row.issues.titleDuplicates ? 'title:ok' : 'title:bad',
          row.issues.descriptionDuplicates ? 'desc:ok' : 'desc:bad',
        ].join('; ')
      : '';

    return [
      row.domain,
      row.phone || '',
      row.email || '',
      row.score ?? '',
      issues,
      row.status || '',
    ]
      .map((cell) => `"${String(cell).replace(/"/g, '""')}"`)
      .join(',');
  });

  return [headers.join(','), ...rows].join('\n');
}

export function downloadCSV(content: string, filename: string): void {
  const blob = new Blob(['\uFEFF' + content], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);

  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

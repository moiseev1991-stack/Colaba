import { Package } from 'lucide-react';
import { PageColumn, PageContainer } from '@/components/ui/page';

export default function GosSettingsPage() {
  return (
    <PageContainer>
      <PageColumn>
        <h1 className="text-xl font-semibold mb-6" style={{ color: 'hsl(var(--text))' }}>
          Настройки — Госзакупки
        </h1>

        <div className="rounded-[12px] border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6">
          <div className="flex items-start gap-4">
            <Package className="h-8 w-8 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
            <div>
              <h2 className="text-base font-medium mb-1" style={{ color: 'hsl(var(--text))' }}>
                Источник данных
              </h2>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                Данные загружаются напрямую из <strong>zakupki.gov.ru</strong> (Единая
                информационная система). Дополнительная настройка не требуется.
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Доступны закупки по 44-ФЗ, 223-ФЗ и малые закупки по ППРФ 615.
              </p>
            </div>
          </div>
        </div>
      </PageColumn>
    </PageContainer>
  );
}

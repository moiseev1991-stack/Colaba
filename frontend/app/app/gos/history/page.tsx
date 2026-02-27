import { Search, Package } from 'lucide-react';
import Link from 'next/link';

export default function GosHistoryPage() {

  return (
    <div className="mx-auto max-w-[1100px] px-6 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-[20px] font-semibold" style={{ color: 'hsl(var(--text))' }}>История поиска госзакупок</h1>
        <Link
          href="/app/gos"
          className="inline-flex items-center gap-1.5 rounded-[8px] border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-1.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
        >
          <Search className="h-4 w-4" /> Новый поиск
        </Link>
      </div>

      <div className="rounded-[12px] border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6">
        <div className="py-10 text-center">
          <Package className="h-10 w-10 mx-auto mb-3 text-gray-300 dark:text-gray-600" />
          <p className="text-sm text-gray-500 dark:text-gray-400">История поисков сохраняется в браузере.<br />Переходите на вкладку поиска, чтобы найти тендеры.</p>
        </div>
      </div>
    </div>
  );
}

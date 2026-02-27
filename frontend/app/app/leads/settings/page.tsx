'use client';

import Link from 'next/link';
import { Settings, List, Search } from 'lucide-react';

export default function LeadsSettingsPage() {
  return (
    <div className="mx-auto max-w-[900px] px-6 py-8">
      <h1 className="text-[20px] font-semibold mb-6" style={{ color: 'hsl(var(--text))' }}>Настройки поиска лидов</h1>

      <div className="grid sm:grid-cols-2 gap-4">
        <Link
          href="/app/leads/blacklist"
          className="rounded-[12px] border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6 hover:border-blue-400 dark:hover:border-blue-500 transition-colors block"
        >
          <List className="h-8 w-8 text-blue-600 dark:text-blue-400 mb-3" />
          <h2 className="text-[15px] font-semibold mb-1" style={{ color: 'hsl(var(--text))' }}>Чёрный список доменов</h2>
          <p className="text-[13px] text-gray-600 dark:text-gray-400">Домены, которые исключаются из результатов поиска</p>
        </Link>

        <Link
          href="/settings/providers"
          className="rounded-[12px] border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6 hover:border-blue-400 dark:hover:border-blue-500 transition-colors block"
        >
          <Settings className="h-8 w-8 text-blue-600 dark:text-blue-400 mb-3" />
          <h2 className="text-[15px] font-semibold mb-1" style={{ color: 'hsl(var(--text))' }}>Провайдеры поиска</h2>
          <p className="text-[13px] text-gray-600 dark:text-gray-400">Настройки API-ключей для Яндекс XML, SerpAPI</p>
        </Link>

        <Link
          href="/settings/captcha"
          className="rounded-[12px] border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6 hover:border-blue-400 dark:hover:border-blue-500 transition-colors block"
        >
          <Search className="h-8 w-8 text-blue-600 dark:text-blue-400 mb-3" />
          <h2 className="text-[15px] font-semibold mb-1" style={{ color: 'hsl(var(--text))' }}>Обход капчи</h2>
          <p className="text-[13px] text-gray-600 dark:text-gray-400">2captcha, anticaptcha и другие сервисы</p>
        </Link>
      </div>
    </div>
  );
}

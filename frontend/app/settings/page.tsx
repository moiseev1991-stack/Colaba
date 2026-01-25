'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function SettingsPage() {
  const initialSettings = {
    robotsTxt: true,
    sitemap: true,
    duplicateTitlesDescriptions: true,
    emptyTitlesDescriptions: true,
  };

  const [savedSeoSettings, setSavedSeoSettings] = useState({ ...initialSettings });
  const [seoSettings, setSeoSettings] = useState({ ...initialSettings });
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    const hasAnyChanges = 
      seoSettings.robotsTxt !== savedSeoSettings.robotsTxt ||
      seoSettings.sitemap !== savedSeoSettings.sitemap ||
      seoSettings.duplicateTitlesDescriptions !== savedSeoSettings.duplicateTitlesDescriptions ||
      seoSettings.emptyTitlesDescriptions !== savedSeoSettings.emptyTitlesDescriptions;
    setHasChanges(hasAnyChanges);
  }, [seoSettings, savedSeoSettings]);

  const handleSeoChange = (key: keyof typeof seoSettings) => {
    setSeoSettings(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  const handleApplyChanges = () => {
    // Apply changes - save current settings as saved
    setSavedSeoSettings(seoSettings);
    setHasChanges(false);
    // In real app, you would save to backend/localStorage here
    alert('Изменения применены');
  };

  const handleResetChanges = () => {
    // Reset to saved settings
    setSeoSettings({ ...savedSeoSettings });
    setHasChanges(false);
  };

  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      <div className="space-y-8">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Settings className="h-8 w-8 text-gray-700 dark:text-gray-300" />
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white">Конфигурация поиска</h1>
        </div>

        {/* SEO Block */}
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 shadow-sm">
          <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-6">SEO</h2>
          
          <div className="space-y-4">
            {/* Robots.txt */}
            <label className="flex items-center gap-3 cursor-pointer group">
              <div className="relative">
                <input
                  type="checkbox"
                  checked={seoSettings.robotsTxt}
                  onChange={() => handleSeoChange('robotsTxt')}
                  className="sr-only"
                />
                <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${
                  seoSettings.robotsTxt
                    ? 'bg-red-600 border-red-600'
                    : 'bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 group-hover:border-red-500'
                }`}>
                  {seoSettings.robotsTxt && (
                    <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>
              </div>
              <span className="text-base text-gray-700 dark:text-gray-300">
                Отсутствие файла robots.txt
              </span>
            </label>

            {/* Sitemap */}
            <label className="flex items-center gap-3 cursor-pointer group">
              <div className="relative">
                <input
                  type="checkbox"
                  checked={seoSettings.sitemap}
                  onChange={() => handleSeoChange('sitemap')}
                  className="sr-only"
                />
                <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${
                  seoSettings.sitemap
                    ? 'bg-red-600 border-red-600'
                    : 'bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 group-hover:border-red-500'
                }`}>
                  {seoSettings.sitemap && (
                    <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>
              </div>
              <span className="text-base text-gray-700 dark:text-gray-300">
                Отсутствие файла sitemap
              </span>
            </label>

            {/* Duplicate Titles and Descriptions */}
            <label className="flex items-center gap-3 cursor-pointer group">
              <div className="relative">
                <input
                  type="checkbox"
                  checked={seoSettings.duplicateTitlesDescriptions}
                  onChange={() => handleSeoChange('duplicateTitlesDescriptions')}
                  className="sr-only"
                />
                <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${
                  seoSettings.duplicateTitlesDescriptions
                    ? 'bg-red-600 border-red-600'
                    : 'bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 group-hover:border-red-500'
                }`}>
                  {seoSettings.duplicateTitlesDescriptions && (
                    <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>
              </div>
              <span className="text-base text-gray-700 dark:text-gray-300">
                Дублирующиеся заголовки и описания
              </span>
            </label>

            {/* Empty Titles and Descriptions */}
            <label className="flex items-center gap-3 cursor-pointer group">
              <div className="relative">
                <input
                  type="checkbox"
                  checked={seoSettings.emptyTitlesDescriptions}
                  onChange={() => handleSeoChange('emptyTitlesDescriptions')}
                  className="sr-only"
                />
                <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${
                  seoSettings.emptyTitlesDescriptions
                    ? 'bg-red-600 border-red-600'
                    : 'bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 group-hover:border-red-500'
                }`}>
                  {seoSettings.emptyTitlesDescriptions && (
                    <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>
              </div>
              <span className="text-base text-gray-700 dark:text-gray-300">
                Отсутствие заголовков и описаний (пустые заголовки и описания)
              </span>
            </label>
          </div>

          {/* Apply Changes Button */}
          <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
            <div className="flex gap-4">
              <Button
                onClick={handleApplyChanges}
                disabled={!hasChanges}
                className={`${
                  hasChanges
                    ? 'bg-red-600 hover:bg-red-700 text-white cursor-pointer'
                    : 'bg-gray-300 dark:bg-gray-600 text-gray-500 dark:text-gray-400 cursor-not-allowed opacity-50'
                }`}
              >
                Применить изменения
              </Button>
              <Button
                onClick={handleResetChanges}
                disabled={!hasChanges}
                variant="outline"
                className={`${
                  hasChanges
                    ? 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer'
                    : 'border-gray-200 dark:border-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed opacity-50'
                }`}
              >
                Сбросить изменения
              </Button>
            </div>
          </div>
          <div className="mt-5"></div>
        </div>

        {/* Провайдеры поиска */}
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 shadow-sm">
          <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-2">Провайдеры поиска</h2>
          <p className="text-gray-500 dark:text-gray-400 mb-4">
            Настройка DuckDuckGo, Яндекс HTML/XML, Google HTML, SerpAPI: прокси, API-ключи, проверка подключения.
          </p>
          <Link href="/settings/providers">
            <Button variant="outline" size="sm">
              Открыть настройки провайдеров
            </Button>
          </Link>
        </div>

        {/* AI-ассистенты */}
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 shadow-sm">
          <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-2">AI-ассистенты</h2>
          <p className="text-gray-500 dark:text-gray-400 mb-4">
            OpenAI, Anthropic, Google, Ollama и др.: настройка моделей для чата и vision (в т.ч. обход капчи).
          </p>
          <Link href="/settings/ai-assistants">
            <Button variant="outline" size="sm">
              Открыть AI-ассистенты
            </Button>
          </Link>
        </div>

        {/* Обход капчи */}
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 shadow-sm">
          <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-2">Обход капчи</h2>
          <p className="text-gray-500 dark:text-gray-400 mb-4">
            AI Vision для картинок, 2captcha и Anti-captcha для reCAPTCHA. Выбор AI-ассистента, проверка подключения.
          </p>
          <Link href="/settings/captcha">
            <Button variant="outline" size="sm">
              Открыть настройки обхода капчи
            </Button>
          </Link>
        </div>

        {/* Contacts Block */}
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 shadow-sm">
          <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-6">Контакты</h2>
          <p className="text-gray-500 dark:text-gray-400">Скоро будет</p>
        </div>

        {/* Price Search Block */}
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 shadow-sm">
          <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-6">Поиск цен</h2>
          <p className="text-gray-500 dark:text-gray-400">Скоро будет</p>
        </div>
      </div>
    </div>
  );
}

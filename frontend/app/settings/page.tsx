'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ButtonV2 } from '@/components/ui/ButtonV2';
import { CardV2 } from '@/components/ui/CardV2';
import { PageHeader } from '@/components/PageHeader';
import { Check } from 'lucide-react';

// §4.17 ТЗ редизайна 2026-06-03 (Phase C batch 5): конфигурация на v2.
// 4 идентичных чекбокс-блока вынесены в SeoCheckbox helper. CardV2 для секций.

type SeoSettingKey = 'robotsTxt' | 'sitemap' | 'duplicateTitlesDescriptions' | 'emptyTitlesDescriptions';

const SEO_CHECKS: { key: SeoSettingKey; label: string }[] = [
  { key: 'robotsTxt', label: 'Отсутствие файла robots.txt' },
  { key: 'sitemap', label: 'Отсутствие файла sitemap' },
  { key: 'duplicateTitlesDescriptions', label: 'Дублирующиеся заголовки и описания' },
  { key: 'emptyTitlesDescriptions', label: 'Отсутствие заголовков и описаний (пустые заголовки и описания)' },
];

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
    const hasAnyChanges = SEO_CHECKS.some(({ key }) => seoSettings[key] !== savedSeoSettings[key]);
    setHasChanges(hasAnyChanges);
  }, [seoSettings, savedSeoSettings]);

  const handleSeoChange = (key: SeoSettingKey) => {
    setSeoSettings(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleApplyChanges = () => {
    setSavedSeoSettings(seoSettings);
    setHasChanges(false);
    alert('Изменения применены');
  };

  const handleResetChanges = () => {
    setSeoSettings({ ...savedSeoSettings });
    setHasChanges(false);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 overflow-x-hidden">
      <div className="space-y-6">
        <PageHeader breadcrumb={[{ label: 'Главная', href: '/' }, { label: 'Конфигурация' }]} title="Конфигурация" />

        {/* SEO Block */}
        <CardV2 className="p-6">
          <h2
            className="font-display font-semibold tracking-tight text-2xl mb-6"
            style={{ color: 'hsl(var(--text))' }}
          >
            SEO
          </h2>

          <div className="space-y-4">
            {SEO_CHECKS.map(({ key, label }) => (
              <SeoCheckbox
                key={key}
                checked={seoSettings[key]}
                onToggle={() => handleSeoChange(key)}
                label={label}
              />
            ))}
          </div>

          <div className="mt-6 pt-6 border-t" style={{ borderColor: 'hsl(var(--border))' }}>
            <div className="flex gap-3">
              <ButtonV2
                variant="primary"
                size="md"
                onClick={handleApplyChanges}
                disabled={!hasChanges}
              >
                Применить изменения
              </ButtonV2>
              <ButtonV2
                variant="secondary"
                size="md"
                onClick={handleResetChanges}
                disabled={!hasChanges}
              >
                Сбросить изменения
              </ButtonV2>
            </div>
          </div>
        </CardV2>

        <SettingsLinkBlock
          title="Провайдеры поиска"
          desc="Настройка DuckDuckGo, Яндекс HTML/XML, Google HTML, SerpAPI: прокси, API-ключи, проверка подключения."
          href="/settings/providers"
          cta="Открыть настройки провайдеров"
        />

        <SettingsLinkBlock
          title="AI-ассистенты"
          desc="OpenAI, Anthropic, Google, Ollama и др.: настройка моделей для чата и vision (в т.ч. обход капчи)."
          href="/settings/ai-assistants"
          cta="Открыть AI-ассистенты"
        />

        <SettingsLinkBlock
          title="Обход капчи"
          desc="AI Vision для картинок, 2captcha и Anti-captcha для reCAPTCHA. Выбор AI-ассистента, проверка подключения."
          href="/settings/captcha"
          cta="Открыть настройки обхода капчи"
        />

        <CardV2 className="p-6">
          <h2
            className="font-display font-semibold tracking-tight text-2xl mb-2"
            style={{ color: 'hsl(var(--text))' }}
          >
            Контакты
          </h2>
          <p style={{ color: 'hsl(var(--muted))' }}>Скоро будет</p>
        </CardV2>

        <CardV2 className="p-6">
          <h2
            className="font-display font-semibold tracking-tight text-2xl mb-2"
            style={{ color: 'hsl(var(--text))' }}
          >
            Поиск цен
          </h2>
          <p style={{ color: 'hsl(var(--muted))' }}>Скоро будет</p>
        </CardV2>
      </div>
    </div>
  );
}

// Кастомный «бренд» чекбокс. Раньше 4 копии 18-строчных JSX-блоков — теперь один компонент.
function SeoCheckbox({ checked, onToggle, label }: { checked: boolean; onToggle: () => void; label: string }) {
  return (
    <label className="flex items-center gap-3 cursor-pointer group">
      <div className="relative">
        <input
          type="checkbox"
          checked={checked}
          onChange={onToggle}
          className="sr-only"
        />
        <div
          className={`w-5 h-5 rounded-v2-sm border-2 flex items-center justify-center transition-all ${
            checked
              ? 'bg-brand-500 border-brand-500'
              : 'group-hover:border-brand-400'
          }`}
          style={
            !checked
              ? {
                  background: 'hsl(var(--surface))',
                  borderColor: 'hsl(var(--border))',
                }
              : undefined
          }
        >
          {checked && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
        </div>
      </div>
      <span className="text-base" style={{ color: 'hsl(var(--text))' }}>{label}</span>
    </label>
  );
}

function SettingsLinkBlock({ title, desc, href, cta }: { title: string; desc: string; href: string; cta: string }) {
  return (
    <CardV2 className="p-6">
      <h2
        className="font-display font-semibold tracking-tight text-2xl mb-2"
        style={{ color: 'hsl(var(--text))' }}
      >
        {title}
      </h2>
      <p className="mb-4" style={{ color: 'hsl(var(--muted))' }}>{desc}</p>
      <Link href={href} className="contents">
        <ButtonV2 variant="secondary" size="sm">{cta}</ButtonV2>
      </Link>
    </CardV2>
  );
}

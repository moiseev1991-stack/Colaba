'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';

const FAQ_ITEMS = [
  { q: 'Откуда данные?', a: 'Используем открытые источники: выдачу поисковиков, публичные реестры и данные с сайтов.' },
  { q: 'Насколько это легально?', a: 'Мы соблюдаем ограничения провайдеров и работаем только с публично доступной информацией.' },
  { q: 'Какие форматы экспорта?', a: 'CSV, Excel, а также копирование контактов и данных таблиц.' },
  { q: 'Какие лимиты?', a: 'Лимиты зависят от тарифа. Starter — базовые объёмы, Pro и Team — расширенные.' },
  { q: 'Можно ли работать командой?', a: 'Да. Тарифы Pro и Team предусматривают несколько пользователей и роли.' },
  { q: 'Что если парсинг в процессе?', a: 'Статус отображается в истории запросов. Можно следить за прогрессом и дождаться завершения.' },
];

export function FAQSection() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <section id="faq" className="py-16 md:py-20">
      <div className="container">
        <h2 className="text-2xl font-bold md:text-3xl" style={{ color: 'var(--landing-text)' }}>FAQ</h2>
        <p className="mt-2 text-base" style={{ color: 'var(--landing-muted)' }}>Ответы на частые вопросы</p>
        <div className="mt-12 space-y-2">
          {FAQ_ITEMS.map((item, i) => (
            <div
              key={i}
              className="rounded-[12px] border overflow-hidden transition-colors"
              style={{ backgroundColor: 'var(--landing-card)', borderColor: 'var(--landing-border)' }}
            >
              <button
                onClick={() => setOpen(open === i ? null : i)}
                className="w-full flex items-center justify-between px-4 py-3 text-left text-sm font-medium hover:bg-[var(--landing-accent-soft)] focus:outline-none focus:ring-2 focus:ring-inset focus:ring-[var(--landing-accent)]"
                style={{ color: 'var(--landing-text)' }}
              >
                {item.q}
                <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${open === i ? 'rotate-180' : ''}`} style={{ color: 'var(--landing-muted)' }} />
              </button>
              {open === i && (
                <div className="px-4 pb-3 text-sm" style={{ color: 'var(--landing-muted)' }}>
                  {item.a}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

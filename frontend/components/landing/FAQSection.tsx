'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';

const FAQ_ITEMS = [
  {
    q: 'Откуда контакты и насколько они актуальны?',
    a: 'Используем открытые источники: выдачу поисковиков, 2GIS, публичные реестры и данные с сайтов. Актуальность зависит от источника; рекомендуется проверять перед массовыми рассылками.',
  },
  {
    q: 'Можно ли исключать домены/компании (blacklist)?',
    a: 'Да. В кабинете есть возможность добавлять домены и компании в чёрный список — они будут исключаться из сборов и рассылок.',
  },
  {
    q: 'Какие статусы отправки КП есть?',
    a: 'В очереди, Отправлено, Открыто (письмо открыли), Ошибка (недоставка). Статусы обновляются по мере обработки кампании.',
  },
  {
    q: 'Есть ли лимиты по отправкам?',
    a: 'Да, лимиты зависят от тарифа. Starter — базовые объёмы, Pro и Team — расширенные. Подробности уточняйте при выборе плана.',
  },
  {
    q: 'Как считается запрос/списание?',
    a: 'Один запуск сбора = один запрос. Результаты хранятся в истории и не списываются повторно при просмотре или экспорте.',
  },
  {
    q: 'Можно ли загрузить шаблон КП?',
    a: 'Да. В модуле отправки КП можно создать шаблон письма, использовать переменные (название компании, контакт и т.д.) и отправлять кампании по выбранным получателям.',
  },
  {
    q: 'Политика использования открытых источников',
    a: 'Мы работаем только с публично доступной информацией и соблюдаем ограничения провайдеров. Рекомендуем соблюдать законы о персональных данных и рассылках при использовании сервиса.',
  },
];

export function FAQSection() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <section id="faq" className="landing-section">
      <div className="container">
        <h2 className="text-2xl font-bold md:text-[30px]" style={{ color: 'var(--landing-text)' }}>
          FAQ
        </h2>
        <p className="mt-2 text-base" style={{ color: 'var(--landing-muted)' }}>
          Ответы на частые вопросы о лидах и рассылке КП
        </p>
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
                <ChevronDown
                  className={`h-4 w-4 shrink-0 transition-transform ${open === i ? 'rotate-180' : ''}`}
                  style={{ color: 'var(--landing-muted)' }}
                />
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

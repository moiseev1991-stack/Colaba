'use client';

import { useState } from 'react';

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

interface FAQItemProps {
  question: string;
  answer: string;
  isOpen: boolean;
  onToggle: () => void;
}

function FAQItem({ question, answer, isOpen, onToggle }: FAQItemProps) {
  return (
    <div className={`l-faq__item${isOpen ? ' open' : ''}`}>
      <button
        className="l-faq__q"
        onClick={onToggle}
        aria-expanded={isOpen}
        type="button"
      >
        {question}
        <span className="l-faq__icon">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
            <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </button>
      <div
        className="l-faq__a-wrapper"
        style={{
          maxHeight: isOpen ? '500px' : '0',
          overflow: 'hidden',
          transition: 'max-height 0.3s ease-out',
        }}
      >
        <div className="l-faq__a">
          {answer}
        </div>
      </div>
    </div>
  );
}

export function FAQSection() {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <section id="faq" className="landing-section l-faq">
      <div className="container">
        <div className="section-label reveal">FAQ</div>
        <h2 className="section-title reveal">
          Частые <span style={{ color: 'var(--landing-accent)' }}>вопросы</span>
        </h2>
        <div style={{ maxWidth: '760px' }}>
          {FAQ_ITEMS.map((item, i) => (
            <FAQItem
              key={i}
              question={item.q}
              answer={item.a}
              isOpen={open === i}
              onToggle={() => setOpen(open === i ? null : i)}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

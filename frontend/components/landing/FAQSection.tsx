'use client';

// Секция 7 главной (PR 2.2): 7 вопросов простым языком. Сравнение с Apollo и Snov убрано —
// малому бизнесу в РФ эти названия мало что говорят; отличие от «базы контактов» объяснено здесь один раз.

import { useState } from 'react';

const FAQ_ITEMS = [
  {
    q: 'Откуда берутся жалобы клиентов?',
    a: 'Из реальных отзывов на 2GIS и Яндекс.Картах. AI группирует похожие жалобы по темам — «долгое ожидание», «не перезванивают» — и показывает, сколько раз о них пишут, с цитатой из отзыва. Ничего не придумываем.',
  },
  {
    q: 'Чем это лучше обычной базы контактов?',
    a: 'База даёт только контакт — кому писать. SpinLid показывает ещё и повод: на что жалуются клиенты компании. Письмо начинается с конкретной проблемы, а не с «Здравствуйте, мы предлагаем», поэтому на него чаще отвечают.',
  },
  {
    q: 'Откуда контакты и насколько они актуальны?',
    a: 'Только открытые источники: 2GIS, Яндекс.Карты, публичные реестры и сайты компаний. Телефон или email есть примерно у 40–50% компаний — у тех, кто заполнил карточку или сайт. Перед отправкой контакт лучше проверить.',
  },
  {
    q: 'Сколько стоит SpinLid?',
    a: 'Сейчас SpinLid в бете — пользоваться можно бесплатно. Цены объявим заранее, до запуска оплаты, и предупредим всех участников беты.',
  },
  {
    q: 'Можно ли использовать свой шаблон письма?',
    a: 'Да. В разделе «Шаблоны КП» (коммерческих предложений) можно сохранить свой текст с подстановками: название компании, сайт, контакт, жалоба клиентов. При подготовке письма они заполняются для каждой компании автоматически.',
  },
  {
    q: 'Можно исключить компании, которым я уже писал?',
    a: 'Да. Добавьте их или их сайты в стоп-лист — они пропадут из выдачи и выгрузок.',
  },
  {
    q: 'Как с 152-ФЗ и законом о рекламе?',
    a: 'Мы работаем только с публично доступной информацией о компаниях. SpinLid не рассылает письма: он готовит текст, а отправляете вы — со своей почты или из CRM. Ответственность за соблюдение 152-ФЗ и закона о рекламе при отправке — на стороне отправителя.',
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
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
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

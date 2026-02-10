'use client';

import { useState } from 'react';

const TABS = [
  { id: 'seo', label: 'SEO: домены' },
  { id: 'leads', label: 'Лиды: компании и контакты' },
  { id: 'tenders', label: 'Госзакупки' },
];

const MOCK_SEO = [
  { domain: 'example.ru', title: 'Главная — Example', status: 'OK' },
  { domain: 'sample.com', title: 'Sample Site', status: 'OK' },
];

const MOCK_LEADS = [
  { company: 'Компания А', contact: 'email@a.ru', city: 'Москва' },
  { company: 'Компания Б', contact: 'info@b.ru', city: 'СПб' },
];

const MOCK_TENDERS = [
  { id: '№123', name: 'Поставка оборудования', sum: '1,2 млн ₽' },
  { id: '№124', name: 'Услуги по разработке', sum: '500 тыс ₽' },
];

export function ExamplesSection() {
  const [tab, setTab] = useState('seo');
  return (
    <section id="examples" className="py-16 md:py-20">
      <div className="container">
        <h2 className="text-2xl font-bold md:text-3xl" style={{ color: 'var(--landing-text)' }}>Примеры результатов</h2>
        <p className="mt-2 text-base" style={{ color: 'var(--landing-muted)' }}>Псевдо-скрин: как выглядит результат</p>
        <div className="mt-8 flex gap-2 overflow-x-auto pb-2">
          {TABS.map(({ id, label }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className="shrink-0 px-4 py-2 rounded-[var(--landing-radius)] text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--landing-accent)]"
              style={{
                backgroundColor: tab === id ? 'var(--landing-accent)' : 'var(--landing-accent-soft)',
                color: tab === id ? 'white' : 'var(--landing-accent)',
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="mt-6 rounded-[12px] border overflow-hidden" style={{ backgroundColor: 'var(--landing-card)', borderColor: 'var(--landing-border)' }}>
          {tab === 'seo' && (
            <table className="w-full text-sm">
              <thead>
                <tr style={{ backgroundColor: 'var(--landing-accent-soft)' }}>
                  <th className="py-3 px-4 text-left font-medium" style={{ color: 'var(--landing-text)' }}>Домен</th>
                  <th className="py-3 px-4 text-left font-medium" style={{ color: 'var(--landing-text)' }}>Title</th>
                  <th className="py-3 px-4 text-left font-medium" style={{ color: 'var(--landing-text)' }}>Статус</th>
                </tr>
              </thead>
              <tbody>
                {MOCK_SEO.map((r, i) => (
                  <tr key={i} style={{ borderTop: '1px solid var(--landing-border)' }}>
                    <td className="py-3 px-4" style={{ color: 'var(--landing-text)' }}>{r.domain}</td>
                    <td className="py-3 px-4" style={{ color: 'var(--landing-muted)' }}>{r.title}</td>
                    <td className="py-3 px-4"><span className="rounded px-1.5 py-0.5 text-xs" style={{ backgroundColor: 'rgba(22,163,74,0.15)', color: 'var(--landing-success)' }}>{r.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {tab === 'leads' && (
            <table className="w-full text-sm">
              <thead>
                <tr style={{ backgroundColor: 'var(--landing-accent-soft)' }}>
                  <th className="py-3 px-4 text-left font-medium" style={{ color: 'var(--landing-text)' }}>Компания</th>
                  <th className="py-3 px-4 text-left font-medium" style={{ color: 'var(--landing-text)' }}>Контакт</th>
                  <th className="py-3 px-4 text-left font-medium" style={{ color: 'var(--landing-text)' }}>Город</th>
                </tr>
              </thead>
              <tbody>
                {MOCK_LEADS.map((r, i) => (
                  <tr key={i} style={{ borderTop: '1px solid var(--landing-border)' }}>
                    <td className="py-3 px-4" style={{ color: 'var(--landing-text)' }}>{r.company}</td>
                    <td className="py-3 px-4" style={{ color: 'var(--landing-muted)' }}>{r.contact}</td>
                    <td className="py-3 px-4" style={{ color: 'var(--landing-muted)' }}>{r.city}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {tab === 'tenders' && (
            <table className="w-full text-sm">
              <thead>
                <tr style={{ backgroundColor: 'var(--landing-accent-soft)' }}>
                  <th className="py-3 px-4 text-left font-medium" style={{ color: 'var(--landing-text)' }}>№</th>
                  <th className="py-3 px-4 text-left font-medium" style={{ color: 'var(--landing-text)' }}>Наименование</th>
                  <th className="py-3 px-4 text-left font-medium" style={{ color: 'var(--landing-text)' }}>Сумма</th>
                </tr>
              </thead>
              <tbody>
                {MOCK_TENDERS.map((r, i) => (
                  <tr key={i} style={{ borderTop: '1px solid var(--landing-border)' }}>
                    <td className="py-3 px-4" style={{ color: 'var(--landing-text)' }}>{r.id}</td>
                    <td className="py-3 px-4" style={{ color: 'var(--landing-muted)' }}>{r.name}</td>
                    <td className="py-3 px-4" style={{ color: 'var(--landing-text)' }}>{r.sum}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </section>
  );
}

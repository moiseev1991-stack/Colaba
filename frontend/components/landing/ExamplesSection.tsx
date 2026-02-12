'use client';

import { useState } from 'react';
import { Loader2, Download, Copy } from 'lucide-react';

const TABS = [
  { id: 'leads', label: 'Лиды: компании и контакты' },
  { id: 'campaigns', label: 'Кампании КП: отправки и статусы' },
  { id: 'seo', label: 'SEO: домены' },
  { id: 'tenders', label: 'Госзакупки' },
];

const MOCK_LEADS = [
  { company: 'Компания А', site: 'company-a.ru', phone: '+7 999…', email: 'info@a.ru', source: 'Яндекс', status: 'OK' },
  { company: 'Компания Б', site: 'company-b.com', phone: '—', email: 'contact@b.com', source: 'Google', status: 'OK' },
  { company: 'ООО Рога', site: 'roga.ru', phone: '+7 495…', email: '—', source: 'Яндекс', status: 'OK' },
  { company: 'ИП Копыта', site: 'kopyta.ru', phone: '—', email: 'mail@kopyta.ru', source: '2GIS', status: 'processing' },
  { company: 'ООО Сервис', site: 'service.com', phone: '+7 800…', email: 'info@service.com', source: 'Яндекс', status: 'OK' },
  { company: 'Компания В', site: 'company-v.ru', phone: '+7 916…', email: 'sales@v.ru', source: 'Google', status: 'OK' },
];

const MOCK_CAMPAIGNS = [
  { name: 'КП производителям Москва', recipients: 45, sent: 45, opened: 12, errors: 2, date: '25.02.2026', status: 'OK' },
  { name: 'Рекламное предложение СПб', recipients: 120, sent: 118, opened: 34, errors: 2, date: '24.02.2026', status: 'OK' },
  { name: 'B2B услуги Казань', recipients: 80, sent: 76, opened: 0, errors: 0, date: '24.02.2026', status: 'processing' },
  { name: 'Оптовая поставка', recipients: 60, sent: 60, opened: 18, errors: 1, date: '23.02.2026', status: 'OK' },
  { name: 'IT-аутсорс', recipients: 30, sent: 30, opened: 8, errors: 0, date: '23.02.2026', status: 'OK' },
  { name: 'Стройматериалы регионы', recipients: 95, sent: 93, opened: 22, errors: 2, date: '22.02.2026', status: 'OK' },
];

const MOCK_SEO = [
  { domain: 'example.ru', title: 'Главная — Example', robots: 'OK', sitemap: 'OK', contacts: '✓', status: 'OK' },
  { domain: 'sample.com', title: 'Sample Site', robots: 'OK', sitemap: 'OK', contacts: '✓', status: 'OK' },
  { domain: 'site.org', title: 'Site Org', robots: 'не найден', sitemap: 'OK', contacts: '—', status: 'OK' },
  { domain: 'demo.ru', title: 'Демо', robots: 'OK', sitemap: 'не найдена', contacts: '✓', status: 'OK' },
  { domain: 'test.net', title: 'Test', robots: 'OK', sitemap: 'OK', contacts: '—', status: 'processing' },
  { domain: 'more.ru', title: 'More Site', robots: 'OK', sitemap: 'OK', contacts: '✓', status: 'OK' },
];

const MOCK_TENDERS = [
  { customer: 'ГБУ Москва', subject: 'Поставка оборудования', region: 'Москва', price: '1,2 млн ₽', date: '25.02.2026', status: 'OK' },
  { customer: 'Администрация СПб', subject: 'Услуги разработки', region: 'СПб', price: '500 тыс ₽', date: '26.02.2026', status: 'OK' },
  { customer: 'Минстрой', subject: 'Стройматериалы', region: 'РФ', price: '5 млн ₽', date: '27.02.2026', status: 'processing' },
  { customer: 'ГКУ Регион', subject: 'ИТ-оборудование', region: 'МО', price: '800 тыс ₽', date: '28.02.2026', status: 'OK' },
  { customer: 'Муниципалитет', subject: 'Мебель', region: 'Краснодар', price: '300 тыс ₽', date: '01.03.2026', status: 'OK' },
  { customer: 'ФГУП', subject: 'Серверы', region: 'Москва', price: '2 млн ₽', date: '02.03.2026', status: 'OK' },
];

function StatusBadge({ status }: { status: string }) {
  if (status === 'processing') {
    return (
      <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs" style={{ backgroundColor: 'rgba(245,158,11,0.15)', color: 'var(--landing-warning)' }}>
        <Loader2 className="h-3 w-3 animate-spin" /> В работе
      </span>
    );
  }
  return (
    <span className="rounded px-1.5 py-0.5 text-xs" style={{ backgroundColor: 'rgba(22,163,74,0.15)', color: 'var(--landing-success)' }}>OK</span>
  );
}

export function ExamplesSection() {
  const [tab, setTab] = useState('leads');
  return (
    <section id="examples" className="landing-section">
      <div className="container">
        <h2 className="text-2xl font-bold md:text-[30px]" style={{ color: 'var(--landing-text)' }}>
          Примеры результатов
        </h2>
        <p className="mt-2 text-base" style={{ color: 'var(--landing-muted)' }}>
          Лиды, кампании КП, SEO и госзакупки — как в кабинете
        </p>
        <div className="mt-8 flex gap-2 overflow-x-auto pb-2">
          {TABS.map(({ id, label }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className="shrink-0 px-4 py-2 rounded-[var(--landing-radius)] text-sm font-medium transition-colors"
              style={{
                backgroundColor: tab === id ? 'var(--landing-accent)' : 'var(--landing-accent-soft)',
                color: tab === id ? 'white' : 'var(--landing-accent)',
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="mt-6 flex gap-2">
          <button
            className="inline-flex items-center gap-2 h-9 px-4 rounded-[var(--landing-radius)] text-sm font-medium border"
            style={{ borderColor: 'var(--landing-border)', color: 'var(--landing-text)' }}
          >
            <Download className="h-4 w-4" />
            Скачать CSV
          </button>
          <button
            className="inline-flex items-center gap-2 h-9 px-4 rounded-[var(--landing-radius)] text-sm font-medium"
            style={{ color: 'var(--landing-muted)' }}
          >
            <Copy className="h-4 w-4" />
            Копировать
          </button>
        </div>
        <div className="mt-4 rounded-[12px] border overflow-x-auto" style={{ backgroundColor: 'var(--landing-card)', borderColor: 'var(--landing-border)' }}>
          {tab === 'leads' && (
            <table className="w-full text-sm min-w-[640px]">
              <thead>
                <tr style={{ backgroundColor: 'var(--landing-accent-soft)' }}>
                  <th className="py-3 px-4 text-left font-medium" style={{ color: 'var(--landing-text)' }}>Компания</th>
                  <th className="py-3 px-4 text-left font-medium" style={{ color: 'var(--landing-text)' }}>Сайт</th>
                  <th className="py-3 px-4 text-left font-medium" style={{ color: 'var(--landing-text)' }}>Телефон</th>
                  <th className="py-3 px-4 text-left font-medium" style={{ color: 'var(--landing-text)' }}>Email</th>
                  <th className="py-3 px-4 text-left font-medium" style={{ color: 'var(--landing-text)' }}>Источник</th>
                  <th className="py-3 px-4 text-left font-medium" style={{ color: 'var(--landing-text)' }}>Статус</th>
                </tr>
              </thead>
              <tbody>
                {MOCK_LEADS.map((r, i) => (
                  <tr key={i} style={{ borderTop: '1px solid var(--landing-border)' }}>
                    <td className="py-3 px-4" style={{ color: 'var(--landing-text)' }}>{r.company}</td>
                    <td className="py-3 px-4" style={{ color: 'var(--landing-muted)' }}>{r.site}</td>
                    <td className="py-3 px-4" style={{ color: 'var(--landing-muted)' }}>{r.phone}</td>
                    <td className="py-3 px-4" style={{ color: 'var(--landing-muted)' }}>{r.email}</td>
                    <td className="py-3 px-4" style={{ color: 'var(--landing-muted)' }}>{r.source}</td>
                    <td className="py-3 px-4"><StatusBadge status={r.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {tab === 'campaigns' && (
            <table className="w-full text-sm min-w-[720px]">
              <thead>
                <tr style={{ backgroundColor: 'var(--landing-accent-soft)' }}>
                  <th className="py-3 px-4 text-left font-medium" style={{ color: 'var(--landing-text)' }}>Кампания</th>
                  <th className="py-3 px-4 text-left font-medium" style={{ color: 'var(--landing-text)' }}>Получателей</th>
                  <th className="py-3 px-4 text-left font-medium" style={{ color: 'var(--landing-text)' }}>Отправлено</th>
                  <th className="py-3 px-4 text-left font-medium" style={{ color: 'var(--landing-text)' }}>Открыто</th>
                  <th className="py-3 px-4 text-left font-medium" style={{ color: 'var(--landing-text)' }}>Ошибки</th>
                  <th className="py-3 px-4 text-left font-medium" style={{ color: 'var(--landing-text)' }}>Дата</th>
                  <th className="py-3 px-4 text-left font-medium" style={{ color: 'var(--landing-text)' }}>Экспорт</th>
                </tr>
              </thead>
              <tbody>
                {MOCK_CAMPAIGNS.map((r, i) => (
                  <tr key={i} style={{ borderTop: '1px solid var(--landing-border)' }}>
                    <td className="py-3 px-4" style={{ color: 'var(--landing-text)' }}>{r.name}</td>
                    <td className="py-3 px-4" style={{ color: 'var(--landing-muted)' }}>{r.recipients}</td>
                    <td className="py-3 px-4" style={{ color: 'var(--landing-muted)' }}>{r.sent}</td>
                    <td className="py-3 px-4" style={{ color: 'var(--landing-muted)' }}>{r.opened}</td>
                    <td className="py-3 px-4" style={{ color: r.errors ? 'var(--landing-danger)' : 'var(--landing-muted)' }}>{r.errors}</td>
                    <td className="py-3 px-4" style={{ color: 'var(--landing-muted)' }}>{r.date}</td>
                    <td className="py-3 px-4">
                      {r.status === 'processing' ? (
                        <StatusBadge status={r.status} />
                      ) : (
                        <span className="text-xs" style={{ color: 'var(--landing-accent)' }}>CSV</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {tab === 'seo' && (
            <table className="w-full text-sm min-w-[640px]">
              <thead>
                <tr style={{ backgroundColor: 'var(--landing-accent-soft)' }}>
                  <th className="py-3 px-4 text-left font-medium" style={{ color: 'var(--landing-text)' }}>Домен</th>
                  <th className="py-3 px-4 text-left font-medium" style={{ color: 'var(--landing-text)' }}>Title</th>
                  <th className="py-3 px-4 text-left font-medium" style={{ color: 'var(--landing-text)' }}>Robots</th>
                  <th className="py-3 px-4 text-left font-medium" style={{ color: 'var(--landing-text)' }}>Sitemap</th>
                  <th className="py-3 px-4 text-left font-medium" style={{ color: 'var(--landing-text)' }}>Контакты</th>
                  <th className="py-3 px-4 text-left font-medium" style={{ color: 'var(--landing-text)' }}>Статус</th>
                </tr>
              </thead>
              <tbody>
                {MOCK_SEO.map((r, i) => (
                  <tr key={i} style={{ borderTop: '1px solid var(--landing-border)' }}>
                    <td className="py-3 px-4" style={{ color: 'var(--landing-text)' }}>{r.domain}</td>
                    <td className="py-3 px-4 max-w-[200px] truncate" style={{ color: 'var(--landing-muted)' }} title={r.title}>{r.title}</td>
                    <td className="py-3 px-4" style={{ color: 'var(--landing-muted)' }}>{r.robots}</td>
                    <td className="py-3 px-4" style={{ color: 'var(--landing-muted)' }}>{r.sitemap}</td>
                    <td className="py-3 px-4" style={{ color: 'var(--landing-muted)' }}>{r.contacts}</td>
                    <td className="py-3 px-4"><StatusBadge status={r.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {tab === 'tenders' && (
            <table className="w-full text-sm min-w-[720px]">
              <thead>
                <tr style={{ backgroundColor: 'var(--landing-accent-soft)' }}>
                  <th className="py-3 px-4 text-left font-medium" style={{ color: 'var(--landing-text)' }}>Заказчик</th>
                  <th className="py-3 px-4 text-left font-medium" style={{ color: 'var(--landing-text)' }}>Предмет</th>
                  <th className="py-3 px-4 text-left font-medium" style={{ color: 'var(--landing-text)' }}>Регион</th>
                  <th className="py-3 px-4 text-left font-medium" style={{ color: 'var(--landing-text)' }}>Цена</th>
                  <th className="py-3 px-4 text-left font-medium" style={{ color: 'var(--landing-text)' }}>Дата</th>
                  <th className="py-3 px-4 text-left font-medium" style={{ color: 'var(--landing-text)' }}>Статус</th>
                </tr>
              </thead>
              <tbody>
                {MOCK_TENDERS.map((r, i) => (
                  <tr key={i} style={{ borderTop: '1px solid var(--landing-border)' }}>
                    <td className="py-3 px-4" style={{ color: 'var(--landing-text)' }}>{r.customer}</td>
                    <td className="py-3 px-4" style={{ color: 'var(--landing-muted)' }}>{r.subject}</td>
                    <td className="py-3 px-4" style={{ color: 'var(--landing-muted)' }}>{r.region}</td>
                    <td className="py-3 px-4" style={{ color: 'var(--landing-text)' }}>{r.price}</td>
                    <td className="py-3 px-4" style={{ color: 'var(--landing-muted)' }}>{r.date}</td>
                    <td className="py-3 px-4"><StatusBadge status={r.status} /></td>
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

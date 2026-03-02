'use client';

import { useState } from 'react';
import { Loader2, Download, Copy } from 'lucide-react';

const TABS = [
  { id: 'leads', label: 'Лиды: компании и контакты' },
  { id: 'campaigns', label: 'Кампании КП' },
  { id: 'seo', label: 'SEO: домены' },
  { id: 'tenders', label: 'Госзакупки' },
];

const MOCK_LEADS = [
  { company: 'Компания А', site: 'company-a.ru', phone: '+7 999…', email: 'info@a.ru', source: 'Яндекс', status: 'OK' },
  { company: 'Компания Б', site: 'company-b.com', phone: '—', email: 'contact@b.com', source: 'Google', status: 'OK' },
  { company: 'ООО Рога', site: 'roga.ru', phone: '+7 495…', email: '—', source: 'Яндекс', status: 'OK' },
  { company: 'ИП Копыта', site: 'kopyta.ru', phone: '—', email: 'mail@kopyta.ru', source: '2GIS', status: 'processing' },
  { company: 'ООО Сервис', site: 'service.com', phone: '+7 800…', email: 'info@service.com', source: 'Яндекс', status: 'OK' },
];

const MOCK_CAMPAIGNS = [
  { name: 'КП производителям Москва', recipients: 45, sent: 45, opened: 12, errors: 2, date: '25.02.2026', status: 'OK' },
  { name: 'Рекламное предложение СПб', recipients: 120, sent: 118, opened: 34, errors: 2, date: '24.02.2026', status: 'OK' },
  { name: 'B2B услуги Казань', recipients: 80, sent: 76, opened: 0, errors: 0, date: '24.02.2026', status: 'processing' },
  { name: 'Оптовая поставка', recipients: 60, sent: 60, opened: 18, errors: 1, date: '23.02.2026', status: 'OK' },
  { name: 'IT-аутсорс', recipients: 30, sent: 30, opened: 8, errors: 0, date: '23.02.2026', status: 'OK' },
];

const MOCK_SEO = [
  { domain: 'example.ru', title: 'Главная — Example', robots: 'OK', sitemap: 'OK', contacts: '✓', status: 'OK' },
  { domain: 'sample.com', title: 'Sample Site', robots: 'OK', sitemap: 'OK', contacts: '✓', status: 'OK' },
  { domain: 'site.org', title: 'Site Org', robots: 'не найден', sitemap: 'OK', contacts: '—', status: 'OK' },
  { domain: 'demo.ru', title: 'Демо', robots: 'OK', sitemap: 'не найдена', contacts: '✓', status: 'OK' },
];

const MOCK_TENDERS = [
  { customer: 'ГБУ Москва', subject: 'Поставка оборудования', region: 'Москва', price: '1,2 млн ₽', date: '25.02.2026', status: 'OK' },
  { customer: 'Администрация СПб', subject: 'Услуги разработки', region: 'СПб', price: '500 тыс ₽', date: '26.02.2026', status: 'OK' },
  { customer: 'Минстрой', subject: 'Стройматериалы', region: 'РФ', price: '5 млн ₽', date: '27.02.2026', status: 'processing' },
  { customer: 'ГКУ Регион', subject: 'ИТ-оборудование', region: 'МО', price: '800 тыс ₽', date: '28.02.2026', status: 'OK' },
];

function StatusBadge({ status }: { status: string }) {
  if (status === 'processing') {
    return (
      <span
        className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs"
        style={{ backgroundColor: 'rgba(245,158,11,0.15)', color: 'var(--landing-warning)' }}
      >
        <Loader2 className="h-3 w-3 animate-spin" /> В работе
      </span>
    );
  }
  return (
    <span
      className="rounded px-2 py-0.5 text-xs"
      style={{ backgroundColor: 'rgba(14,169,122,0.15)', color: 'var(--landing-accent)' }}
    >
      OK
    </span>
  );
}

export function ExamplesSection() {
  const [tab, setTab] = useState('leads');

  return (
    <section id="examples" className="landing-section l-examples">
      <div className="container">
        <div className="section-label reveal">Примеры результатов</div>
        <h2 className="section-title reveal">
          Как выглядит <span style={{ color: 'var(--landing-accent)' }}>в кабинете</span>
        </h2>

        {/* Tabs */}
        <div className="l-examples__tabs reveal">
          {TABS.map(({ id, label }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`l-examples__tab${tab === id ? ' active' : ''}`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Actions */}
        <div className="reveal" style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
          <button
            className="l-btn l-btn--outline"
            style={{ padding: '8px 16px', fontSize: '13px', gap: '6px' }}
          >
            <Download size={14} />
            Скачать CSV
          </button>
          <button
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 16px',
              fontSize: '13px',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--landing-muted)',
              fontFamily: 'Inter, sans-serif',
            }}
          >
            <Copy size={14} />
            Копировать
          </button>
        </div>

        {/* Table */}
        <div className="l-examples__table-wrap reveal" style={{ overflowX: 'auto' }}>
          {tab === 'leads' && (
            <table className="l-examples__table" style={{ minWidth: '600px' }}>
              <thead>
                <tr>
                  {['Компания', 'Сайт', 'Телефон', 'Email', 'Источник', 'Статус'].map(h => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {MOCK_LEADS.map((r, i) => (
                  <tr key={i}>
                    <td style={{ fontWeight: 600 }}>{r.company}</td>
                    <td>{r.site}</td>
                    <td>{r.phone}</td>
                    <td>{r.email}</td>
                    <td>{r.source}</td>
                    <td><StatusBadge status={r.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {tab === 'campaigns' && (
            <table className="l-examples__table" style={{ minWidth: '680px' }}>
              <thead>
                <tr>
                  {['Кампания', 'Получателей', 'Отправлено', 'Открыто', 'Ошибки', 'Дата', 'Статус'].map(h => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {MOCK_CAMPAIGNS.map((r, i) => (
                  <tr key={i}>
                    <td style={{ fontWeight: 600 }}>{r.name}</td>
                    <td>{r.recipients}</td>
                    <td>{r.sent}</td>
                    <td>{r.opened}</td>
                    <td style={{ color: r.errors ? 'var(--landing-danger)' : undefined }}>{r.errors}</td>
                    <td>{r.date}</td>
                    <td><StatusBadge status={r.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {tab === 'seo' && (
            <table className="l-examples__table" style={{ minWidth: '600px' }}>
              <thead>
                <tr>
                  {['Домен', 'Title', 'Robots', 'Sitemap', 'Контакты', 'Статус'].map(h => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {MOCK_SEO.map((r, i) => (
                  <tr key={i}>
                    <td style={{ fontWeight: 600 }}>{r.domain}</td>
                    <td style={{ maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.title}</td>
                    <td>{r.robots}</td>
                    <td>{r.sitemap}</td>
                    <td>{r.contacts}</td>
                    <td><StatusBadge status={r.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {tab === 'tenders' && (
            <table className="l-examples__table" style={{ minWidth: '640px' }}>
              <thead>
                <tr>
                  {['Заказчик', 'Предмет', 'Регион', 'Цена', 'Дата', 'Статус'].map(h => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {MOCK_TENDERS.map((r, i) => (
                  <tr key={i}>
                    <td style={{ fontWeight: 600 }}>{r.customer}</td>
                    <td>{r.subject}</td>
                    <td>{r.region}</td>
                    <td>{r.price}</td>
                    <td>{r.date}</td>
                    <td><StatusBadge status={r.status} /></td>
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

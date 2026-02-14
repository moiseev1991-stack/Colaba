import { Search, Download, Send, FileEdit, History } from 'lucide-react';

const DEMO_LEADS = [
  { company: 'ООО Альфа-Снаб', city: 'Москва', contact: 'sales@alfa…', status: 'Отправлено', statusVariant: 'sent' as const },
  { company: 'ИП Петров', city: 'СПб', contact: '+7 9** ***-**-**', status: 'Открыто', statusVariant: 'opened' as const },
  { company: 'Ромашка-Строй', city: 'Казань', contact: 'info@roma…', status: 'Ошибка', statusVariant: 'error' as const },
  { company: 'ТехСервис', city: 'Екатеринбург', contact: '+7 9** ***-**-**', status: 'В работе', statusVariant: 'pending' as const },
  { company: 'СтройМастер', city: 'Новосибирск', contact: 'office@stroy…', status: 'Доставлено', statusVariant: 'delivered' as const },
];

const BENEFITS = [
  { icon: Search, title: 'Сбор лидов по ключевым запросам', subtitle: 'Ищем компании по нише + региону, собираем контакты' },
  { icon: Download, title: 'Экспорт CSV и копирование контактов', subtitle: 'Выгрузка в таблицу, копирование в 1 клик' },
  { icon: Send, title: 'Отправка КП и статусы', subtitle: 'Доставлено / открыто / ошибка — видно в кабинете' },
  { icon: FileEdit, title: 'Редактор КП (шаблоны)', subtitle: 'Шаблоны под разные ниши, быстрые правки' },
  { icon: History, title: 'История лидов и запусков', subtitle: 'Все поиски, результаты и статусы — в одном месте' },
];

const cardStyle = {
  backgroundColor: 'var(--landing-card)',
  boxShadow: '0 4px 20px rgba(15, 23, 42, 0.06)',
  borderRadius: 16,
};

function StatusBadge({ label, variant }: { label: string; variant: 'sent' | 'opened' | 'error' | 'delivered' | 'pending' }) {
  const colors: Record<string, { bg: string; text: string }> = {
    sent: { bg: 'rgba(37, 99, 235, 0.12)', text: 'var(--landing-accent)' },
    opened: { bg: 'rgba(22, 163, 74, 0.12)', text: 'var(--landing-success)' },
    delivered: { bg: 'rgba(22, 163, 74, 0.12)', text: 'var(--landing-success)' },
    error: { bg: 'rgba(239, 68, 68, 0.12)', text: 'var(--landing-danger)' },
    pending: { bg: 'rgba(245, 158, 11, 0.12)', text: 'var(--landing-warning)' },
  };
  const c = colors[variant] || colors.sent;
  return (
    <span className="rounded-full px-2 py-0.5 text-[11px] font-medium" style={{ backgroundColor: c.bg, color: c.text }}>
      {label}
    </span>
  );
}

export function LeadDemoPanel() {
  return (
    <div className="space-y-4 md:space-y-5">
      {/* Card A: Demo table */}
      <div className="rounded-[16px] border p-4" style={{ ...cardStyle, borderColor: 'var(--landing-border)' }}>
        <h4 className="text-sm font-semibold mb-3" style={{ color: 'var(--landing-text)' }}>Пример результата (демо)</h4>
        <div className="overflow-x-auto">
          <table className="w-full text-[12px] min-w-[320px]">
            <thead>
              <tr style={{ color: 'var(--landing-muted)' }}>
                <th className="text-left py-1.5 font-medium">Компания</th>
                <th className="text-left py-1.5 font-medium">Город</th>
                <th className="text-left py-1.5 font-medium">Контакт</th>
                <th className="text-left py-1.5 font-medium">Статус КП</th>
              </tr>
            </thead>
            <tbody style={{ color: 'var(--landing-text)' }}>
              {DEMO_LEADS.map((row, i) => (
                <tr key={i} className="border-t border-[var(--landing-border)]">
                  <td className="py-2 pr-2">{row.company}</td>
                  <td className="py-2 pr-2">{row.city}</td>
                  <td className="py-2 pr-2 opacity-80">{row.contact}</td>
                  <td className="py-2">
                    <StatusBadge label={row.status} variant={row.statusVariant} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Card B: KP status badges */}
      <div className="rounded-[16px] border p-4" style={{ ...cardStyle, borderColor: 'var(--landing-border)' }}>
        <h4 className="text-sm font-semibold mb-2" style={{ color: 'var(--landing-text)' }}>КП и статусы доставки</h4>
        <div className="flex flex-wrap gap-1.5 mb-2">
          <StatusBadge label="Доставлено" variant="delivered" />
          <StatusBadge label="Открыто" variant="opened" />
          <StatusBadge label="Ошибка" variant="error" />
        </div>
        <p className="text-[12px]" style={{ color: 'var(--landing-muted)' }}>Статусы сохраняются в истории лидов</p>
      </div>

      {/* Card C: Что вы получите */}
      <div className="rounded-[16px] border p-4" style={{ ...cardStyle, borderColor: 'var(--landing-border)' }}>
        <h4 className="text-sm font-semibold mb-3" style={{ color: 'var(--landing-text)' }}>Что вы получите</h4>
        <ul className="space-y-3">
          {BENEFITS.map(({ icon: Icon, title, subtitle }) => (
            <li key={title} className="flex gap-3">
              <div
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px]"
                style={{ backgroundColor: 'var(--landing-accent-soft)', color: 'var(--landing-accent)' }}
              >
                <Icon className="h-4 w-4" aria-hidden />
              </div>
              <div>
                <p className="text-[13px] font-semibold leading-tight" style={{ color: 'var(--landing-text)' }}>{title}</p>
                <p className="text-[12px] mt-0.5 leading-snug" style={{ color: 'var(--landing-muted)' }}>{subtitle}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

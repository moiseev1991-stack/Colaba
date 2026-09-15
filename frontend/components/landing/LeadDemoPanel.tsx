import { Search, Download, Copy, FileEdit, History } from 'lucide-react';

// Правая колонка блока регистрации. С 15.09 без «статусов доставки»:
// SpinLid не рассылает письма — готовит черновик, отправляет пользователь.
const DEMO_LEADS = [
  { company: 'ООО Альфа-Снаб', city: 'Москва', contact: 'sales@alfa…', pain: 'Срывают сроки' },
  { company: 'ИП Петров', city: 'СПб', contact: '+7 9** ***-**-**', pain: 'Не перезванивают' },
  { company: 'Ромашка-Строй', city: 'Казань', contact: 'info@roma…', pain: 'Дорого' },
  { company: 'ТехСервис', city: 'Екатеринбург', contact: '+7 9** ***-**-**', pain: 'Долгое ожидание' },
  { company: 'СтройМастер', city: 'Новосибирск', contact: 'office@stroy…', pain: 'Грубят' },
];

const BENEFITS = [
  { icon: Search, title: 'Сбор лидов по ключевым запросам', subtitle: 'Ищем компании по нише + региону, собираем контакты' },
  { icon: Download, title: 'Экспорт CSV и копирование контактов', subtitle: 'Выгрузка в таблицу, копирование в 1 клик' },
  { icon: Copy, title: 'Черновик письма под боль', subtitle: 'Копируете в свою почту или CRM — отправляете сами' },
  { icon: FileEdit, title: 'Редактор КП (шаблоны)', subtitle: 'Шаблоны под разные ниши, быстрые правки' },
  { icon: History, title: 'История поисков', subtitle: 'Все поиски и результаты — в одном месте' },
];

const cardStyle = {
  backgroundColor: 'var(--landing-card)',
  boxShadow: '0 4px 20px rgba(15, 23, 42, 0.06)',
  borderRadius: 16,
};

function PainPill({ label }: { label: string }) {
  return (
    <span
      className="rounded-full px-2 py-0.5 text-[11px] font-medium"
      style={{ backgroundColor: 'rgba(245, 158, 11, 0.12)', color: 'var(--landing-warning)' }}
    >
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
                <th className="text-left py-1.5 font-medium">Главная боль</th>
              </tr>
            </thead>
            <tbody style={{ color: 'var(--landing-text)' }}>
              {DEMO_LEADS.map((row, i) => (
                <tr key={i} className="border-t border-[var(--landing-border)]">
                  <td className="py-2 pr-2">{row.company}</td>
                  <td className="py-2 pr-2">{row.city}</td>
                  <td className="py-2 pr-2 opacity-80">{row.contact}</td>
                  <td className="py-2">
                    <PainPill label={row.pain} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Card B: черновик письма */}
      <div className="rounded-[16px] border p-4" style={{ ...cardStyle, borderColor: 'var(--landing-border)' }}>
        <h4 className="text-sm font-semibold mb-2" style={{ color: 'var(--landing-text)' }}>Черновик письма</h4>
        <div className="flex flex-wrap gap-1.5 mb-2">
          <PainPill label="Боль из отзывов" />
          <PainPill label="Цитата клиента" />
          <PainPill label="Ваша услуга" />
        </div>
        <p className="text-[12px]" style={{ color: 'var(--landing-muted)' }}>
          Текст под каждую компанию — копируете в свою почту или CRM
        </p>
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

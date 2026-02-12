'use client';

import { useState } from 'react';
import { Loader2, Send, CheckCircle, XCircle, Mail } from 'lucide-react';

const DEMO_LEADS = [
  { id: '1', company: 'ООО Рога и Копыта', city: 'Москва', phone: '+7 495 123-45-67', email: 'info@roga.ru', status: null as string | null },
  { id: '2', company: 'ИП Иванов', city: 'СПб', phone: '+7 812 987-65-43', email: 'ivan@mail.ru', status: null as string | null },
  { id: '3', company: 'Компания Альфа', city: 'Казань', phone: '—', email: 'sales@alpha.ru', status: null as string | null },
  { id: '4', company: 'Сервис Плюс', city: 'Екатеринбург', phone: '+7 343 555-00-11', email: '—', status: null as string | null },
  { id: '5', company: 'Торговая база', city: 'Новосибирск', phone: '+7 383 222-33-44', email: 'zakaz@baza.ru', status: null as string | null },
];

type LeadStatus = 'idle' | 'queue' | 'sent' | 'opened' | 'error';

export function HeroSection({
  onCtaRegister,
  onCtaExamples,
}: {
  onCtaRegister: () => void;
  onCtaExamples: () => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set(['1', '2']));
  const [leadStatuses, setLeadStatuses] = useState<Record<string, LeadStatus>>({});
  const [sending, setSending] = useState(false);

  const chips = ['контакты компаний', 'фильтры', 'экспорт CSV', 'рассылки КП', 'история запусков'];

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSendKp = () => {
    if (selected.size === 0 || sending) return;
    setSending(true);
    const ids = Array.from(selected);
    ids.forEach((id) => {
      setTimeout(() => setLeadStatuses((p) => ({ ...p, [id]: 'queue' })), 0);
    });
    ids.forEach((id, i) => {
      setTimeout(() => setLeadStatuses((p) => ({ ...p, [id]: 'sent' })), 600 + i * 200);
    });
    ids.forEach((id, i) => {
      const outcome = i === ids.length - 1 ? 'error' : (i % 2 === 0 ? 'opened' : 'sent');
      setTimeout(() => setLeadStatuses((p) => ({ ...p, [id]: outcome })), 1200 + i * 300);
    });
    setTimeout(() => setSending(false), 2500);
  };

  return (
    <section id="top" className="relative overflow-hidden py-20 md:py-28 landing-section">
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'linear-gradient(135deg, rgba(37, 99, 235, 0.04) 0%, transparent 50%, rgba(139, 92, 246, 0.03) 100%)',
        }}
      />
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.03]"
        style={{
          backgroundImage:
            'url("data:image/svg+xml,%3Csvg width=\'60\' height=\'60\' viewBox=\'0 0 60 60\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cg fill=\'none\' fill-rule=\'evenodd\'%3E%3Cg fill=\'%23000000\' fill-opacity=\'1\'%3E%3Cpath d=\'M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z\'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")',
        }}
      />
      <div className="container relative z-10 grid gap-12 md:grid-cols-2 md:gap-16 md:items-center">
        <div>
          <h1
            className="text-3xl font-bold leading-tight tracking-tight md:text-[48px] md:leading-[1.15]"
            style={{ color: 'var(--landing-text)' }}
          >
            Собирайте базы клиентов и отправляйте КП за минуты
          </h1>
          <p className="mt-5 text-base leading-relaxed md:text-lg" style={{ color: 'var(--landing-muted)' }}>
            Соберите контакты компаний из открытых источников. Отберите нужные. Отправьте КП. Получите таблицу и статусы.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            {chips.map((c) => (
              <span
                key={c}
                className="rounded-full px-3 py-1 text-xs font-medium"
                style={{ backgroundColor: 'var(--landing-accent-soft)', color: 'var(--landing-accent)' }}
              >
                {c}
              </span>
            ))}
          </div>
          <div className="mt-8 flex flex-wrap gap-4">
            <button
              onClick={onCtaRegister}
              className="h-12 px-6 rounded-[var(--landing-radius)] text-sm font-medium text-white transition-opacity hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-[var(--landing-accent)] focus:ring-offset-2"
              style={{ backgroundColor: 'var(--landing-accent)' }}
            >
              Создать аккаунт
            </button>
            <button
              onClick={onCtaExamples}
              className="h-12 px-6 rounded-[var(--landing-radius)] text-sm font-medium border transition-colors hover:bg-[var(--landing-accent-soft)] focus:outline-none focus:ring-2 focus:ring-[var(--landing-accent)] focus:ring-offset-2"
              style={{ borderColor: 'var(--landing-border)', color: 'var(--landing-text)' }}
            >
              Посмотреть демо отправки КП
            </button>
          </div>
        </div>
        <div
          className="rounded-[16px] border shadow-sm p-4 w-full max-w-[520px] mx-auto md:mx-0"
          style={{ backgroundColor: 'var(--landing-card)', borderColor: 'var(--landing-border)' }}
        >
          <div className="text-xs font-medium mb-3 flex items-center gap-2" style={{ color: 'var(--landing-muted)' }}>
            <Mail className="h-4 w-4" />
            Демо: лиды и отправка КП
          </div>
          <div className="overflow-x-auto -mx-1">
            <table className="w-full text-sm min-w-[400px]">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--landing-border)' }}>
                  <th className="py-2 pr-2 w-8" />
                  <th className="py-2 text-left font-medium" style={{ color: 'var(--landing-text)' }}>Компания</th>
                  <th className="py-2 text-left font-medium" style={{ color: 'var(--landing-text)' }}>Город</th>
                  <th className="py-2 text-left font-medium hidden sm:table-cell" style={{ color: 'var(--landing-text)' }}>Телефон</th>
                  <th className="py-2 text-left font-medium" style={{ color: 'var(--landing-text)' }}>Статус</th>
                </tr>
              </thead>
              <tbody>
                {DEMO_LEADS.map((r) => {
                  const st = leadStatuses[r.id] || null;
                  return (
                    <tr key={r.id} style={{ borderBottom: '1px solid var(--landing-border)' }}>
                      <td className="py-2 pr-2">
                        <input
                          type="checkbox"
                          checked={selected.has(r.id)}
                          onChange={() => toggleSelect(r.id)}
                          disabled={sending}
                          className="rounded border-[var(--landing-border)]"
                          style={{ accentColor: 'var(--landing-accent)' }}
                        />
                      </td>
                      <td className="py-2" style={{ color: 'var(--landing-text)' }}>{r.company}</td>
                      <td className="py-2" style={{ color: 'var(--landing-muted)' }}>{r.city}</td>
                      <td className="py-2 hidden sm:table-cell" style={{ color: 'var(--landing-muted)' }}>{r.phone}</td>
                      <td className="py-2">
                        {st === 'queue' && (
                          <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs" style={{ backgroundColor: 'rgba(245,158,11,0.15)', color: 'var(--landing-warning)' }}>
                            <Loader2 className="h-3 w-3 animate-spin" /> В очереди
                          </span>
                        )}
                        {st === 'sent' && (
                          <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs" style={{ backgroundColor: 'rgba(37,99,235,0.15)', color: 'var(--landing-accent)' }}>
                            Отправлено
                          </span>
                        )}
                        {st === 'opened' && (
                          <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs" style={{ backgroundColor: 'rgba(22,163,74,0.15)', color: 'var(--landing-success)' }}>
                            <CheckCircle className="h-3 w-3" /> Открыто
                          </span>
                        )}
                        {st === 'error' && (
                          <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs" style={{ backgroundColor: 'rgba(239,68,68,0.15)', color: 'var(--landing-danger)' }}>
                            <XCircle className="h-3 w-3" /> Ошибка
                          </span>
                        )}
                        {!st && <span className="text-xs" style={{ color: 'var(--landing-muted)' }}>—</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <button
            onClick={handleSendKp}
            disabled={selected.size === 0 || sending}
            className="mt-4 w-full h-10 rounded-[var(--landing-radius)] text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            style={{ backgroundColor: 'var(--landing-accent)' }}
          >
            {sending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Отправка…
              </>
            ) : (
              <>
                <Send className="h-4 w-4" />
                Отправить КП
              </>
            )}
          </button>
        </div>
      </div>
    </section>
  );
}

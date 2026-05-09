'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Mail, Send, MessageCircle, Plus, Pencil, Trash2, FileText, Zap } from 'lucide-react';
import {
  deleteTemplate,
  listTemplates,
  type ProposalChannel,
  type ProposalTemplate,
} from '@/lib/proposalTemplates';
import { ToastContainer, type Toast } from '@/components/Toast';

const CHANNEL_ICON: Record<ProposalChannel, React.ReactNode> = {
  email: <Mail className="h-3.5 w-3.5" />,
  telegram: <Send className="h-3.5 w-3.5" />,
  whatsapp: <MessageCircle className="h-3.5 w-3.5" />,
  max: <Zap className="h-3.5 w-3.5" />,
};
const CHANNEL_LABEL: Record<ProposalChannel, string> = {
  email: 'Email',
  telegram: 'Telegram',
  whatsapp: 'WhatsApp',
  max: 'MAX',
};

function formatRelative(ms: number): string {
  const diffMin = Math.round((Date.now() - ms) / 60000);
  if (diffMin < 1) return 'только что';
  if (diffMin < 60) return `${diffMin} мин назад`;
  const diffH = Math.round(diffMin / 60);
  if (diffH < 24) return `${diffH} ч назад`;
  const diffD = Math.round(diffH / 24);
  if (diffD < 7) return `${diffD} дн назад`;
  return new Date(ms).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
}

export default function ProposalsListPage() {
  const [items, setItems] = useState<ProposalTemplate[]>([]);
  const [toasts, setToasts] = useState<Toast[]>([]);
  // Hydration guard: localStorage isn't available on the server, so we read it
  // only after mount. Until then we render the skeleton.
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setItems(listTemplates());
    setHydrated(true);
  }, []);

  const refresh = () => setItems(listTemplates());

  const handleDelete = (id: string, name: string) => {
    if (!confirm(`Удалить шаблон «${name}»?`)) return;
    deleteTemplate(id);
    refresh();
    setToasts((p) => [...p, { id: Date.now().toString(), type: 'success', message: 'Шаблон удалён' }]);
  };

  return (
    <div className="mx-auto max-w-[1100px] px-6 py-10">
      {/* Hero */}
      <div className="flex items-center gap-3 mb-5">
        <span className="app-live-dot" aria-hidden />
        <span className="app-mono-label" style={{ color: 'hsl(var(--accent))' }}>
          КП / шаблоны
        </span>
        <span className="app-mono-label" style={{ color: 'hsl(var(--muted))' }}>
          фронтенд-черновик · хранится локально
        </span>
      </div>
      <h1 className="text-[36px] md:text-[44px] font-extrabold leading-[1.05] tracking-[-1px] mb-3">
        Шаблоны коммерческих предложений
      </h1>
      <p className="text-[15px] mb-8 max-w-[640px]" style={{ color: 'hsl(var(--muted))' }}>
        Один раз пишете шаблон с переменными — Colaba подставляет имя компании, домен и контакт
        в каждое отправление. Можно несколько шаблонов под разные ситуации.
      </p>

      {/* Toolbar */}
      <div className="flex items-center justify-between mb-4">
        <div className="app-mono-label" style={{ color: 'hsl(var(--muted))' }}>
          {hydrated ? `${items.length} шаблон${items.length === 1 ? '' : items.length < 5 ? 'а' : 'ов'}` : '…'}
        </div>
        <Link
          href="/app/leads/proposals/new"
          className="app-cta-mega"
          style={{ height: 40, padding: '0 18px', fontSize: 13 }}
        >
          <Plus className="h-4 w-4" /> Новый шаблон
        </Link>
      </div>

      {!hydrated ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-[80px] app-skeleton" style={{ borderRadius: 6 }} />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div
          className="p-12 text-center"
          style={{
            background: 'hsl(var(--surface))',
            border: '1px dashed hsl(var(--border))',
            borderRadius: 6,
          }}
        >
          <div
            className="inline-flex items-center justify-center w-14 h-14 mb-4"
            style={{
              background: 'hsl(var(--accent-weak))',
              border: '1px solid hsl(var(--accent) / 0.25)',
              borderRadius: 6,
            }}
          >
            <FileText className="h-6 w-6" style={{ color: 'hsl(var(--accent))' }} />
          </div>
          <h3 className="text-[16px] font-bold mb-2" style={{ color: 'hsl(var(--text))' }}>
            Пока нет ни одного шаблона
          </h3>
          <p className="text-[13px] max-w-[480px] mx-auto mb-5" style={{ color: 'hsl(var(--muted))' }}>
            Создайте первый шаблон — потом сможете отправлять его по выбранным лидам с автоматической
            подстановкой имени компании и контакта.
          </p>
          <Link
            href="/app/leads/proposals/new"
            className="app-cta-mega"
            style={{ height: 40, padding: '0 18px', fontSize: 13 }}
          >
            <Plus className="h-4 w-4" /> Создать первый шаблон
          </Link>
        </div>
      ) : (
        <div className="space-y-1.5">
          {items.map((tpl) => (
            <div key={tpl.id} className="app-run-card">
              <span
                className="inline-flex items-center gap-1.5 px-2 h-6 app-mono-label whitespace-nowrap shrink-0"
                style={{
                  background: 'hsl(var(--accent-weak))',
                  color: 'hsl(var(--accent))',
                  border: '1px solid hsl(var(--accent) / 0.3)',
                  borderRadius: 3,
                }}
              >
                {CHANNEL_ICON[tpl.channel]} {CHANNEL_LABEL[tpl.channel]}
              </span>

              <div className="min-w-0">
                <div className="text-[14px] font-semibold truncate" style={{ color: 'hsl(var(--text))' }}>
                  {tpl.name || <span style={{ color: 'hsl(var(--muted))' }}>(без имени)</span>}
                </div>
                <div
                  className="app-mono-label mt-0.5 truncate"
                  style={{ color: 'hsl(var(--muted))' }}
                  title={tpl.subject || tpl.body}
                >
                  {tpl.channel === 'email' && tpl.subject ? `Тема: ${tpl.subject}` : tpl.body.slice(0, 90)}
                </div>
              </div>

              <span className="app-mono-label shrink-0 hidden sm:inline" style={{ color: 'hsl(var(--muted))' }}>
                {formatRelative(tpl.updatedAt)}
              </span>

              <div className="flex items-center gap-1 shrink-0">
                <Link
                  href={`/app/leads/proposals/${tpl.id}/edit`}
                  className="inline-flex items-center justify-center w-8 h-8 transition-colors hover:bg-[hsl(var(--accent-weak))]"
                  style={{ color: 'hsl(var(--accent))', borderRadius: 4 }}
                  title="Редактировать"
                  aria-label="Редактировать"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Link>
                <button
                  type="button"
                  onClick={() => handleDelete(tpl.id, tpl.name || 'без имени')}
                  className="inline-flex items-center justify-center w-8 h-8 transition-colors hover:bg-[hsl(var(--danger) / 0.15)]"
                  style={{ color: 'hsl(var(--muted))', borderRadius: 4 }}
                  title="Удалить"
                  aria-label="Удалить"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <ToastContainer toasts={toasts} onClose={(id) => setToasts((t) => t.filter((x) => x.id !== id))} />
    </div>
  );
}

'use client';

/**
 * §4.4 ТЗ редизайна 2026-06-03 — Шаблоны КП.
 * Карточки на CardV2 + ButtonV2 + SignalPill, display-шрифт на h1,
 * EmptyState с bg-mesh-brand и атмосферной иконкой.
 */

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

import { CardV2 } from '@/components/ui/CardV2';
import { ButtonV2 } from '@/components/ui/ButtonV2';
import { Skeleton } from '@/components/ui/Skeleton';
import { SignalPill } from '@/components/ui/SignalPill';

const CHANNEL_ICON: Record<ProposalChannel, React.ReactNode> = {
  email: <Mail />,
  telegram: <Send />,
  whatsapp: <MessageCircle />,
  max: <Zap />,
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
  // localStorage недоступен на сервере — читаем после mount.
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
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-10">
      <h1
        className="mb-3 font-display font-semibold leading-[1.05] tracking-tight"
        style={{ fontSize: 'clamp(1.75rem, 4vw, 2.75rem)', color: 'hsl(var(--text))' }}
      >
        Шаблоны <span className="text-gradient-brand">коммерческих предложений</span>
      </h1>
      <p className="mb-8 max-w-[640px] text-[15px] leading-relaxed text-[hsl(var(--muted))]">
        Один раз пишете шаблон с переменными — Colaba подставляет имя компании, домен и контакт
        в каждое отправление. Можно несколько шаблонов под разные ситуации.
      </p>

      <div className="mb-4 flex items-center justify-between">
        <div className="text-[12px] font-medium uppercase tracking-wider text-[hsl(var(--muted))]">
          {hydrated ? `${items.length} шаблон${items.length === 1 ? '' : items.length < 5 ? 'а' : 'ов'}` : '…'}
        </div>
        <Link href="/app/leads/proposals/new">
          <ButtonV2 variant="primary" size="md" iconLeft={<Plus />}>
            Новый шаблон
          </ButtonV2>
        </Link>
      </div>

      {!hydrated ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-[80px]" rounded="lg" />)}
        </div>
      ) : items.length === 0 ? (
        <CardV2 className="bg-mesh-brand px-6 py-12 text-center">
          <div className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-v2-lg bg-brand-gradient text-white shadow-v2-sm">
            <FileText className="h-7 w-7" />
          </div>
          <h3 className="mb-2 font-display text-[18px] font-semibold text-[hsl(var(--text))]">
            Пока нет ни одного шаблона
          </h3>
          <p className="mx-auto mb-5 max-w-[480px] text-[13px] leading-relaxed text-[hsl(var(--muted))]">
            Создайте первый шаблон — потом сможете отправлять его по выбранным лидам с автоматической
            подстановкой имени компании и контакта.
          </p>
          <Link href="/app/leads/proposals/new">
            <ButtonV2 variant="primary" size="md" iconLeft={<Plus />}>
              Создать первый шаблон
            </ButtonV2>
          </Link>
        </CardV2>
      ) : (
        <ul className="reveal-stack space-y-2">
          {items.map((tpl) => (
            <li key={tpl.id}>
              <CardV2
                interactive
                reveal
                className="flex items-center gap-3 px-4 py-3 sm:gap-4 sm:px-5"
              >
                <SignalPill tone="accent" size="sm" icon={CHANNEL_ICON[tpl.channel]}>
                  {CHANNEL_LABEL[tpl.channel]}
                </SignalPill>

                <div className="min-w-0 flex-1">
                  <div className="truncate font-display text-[14px] font-semibold text-[hsl(var(--text))]">
                    {tpl.name || <span className="text-[hsl(var(--muted))]">(без имени)</span>}
                  </div>
                  <div
                    className="mt-0.5 truncate text-[12px] text-[hsl(var(--muted))]"
                    title={tpl.subject || tpl.body}
                  >
                    {tpl.channel === 'email' && tpl.subject ? `Тема: ${tpl.subject}` : tpl.body.slice(0, 90)}
                  </div>
                </div>

                <span className="hidden shrink-0 text-[11px] font-medium uppercase tracking-wider text-[hsl(var(--muted))] sm:inline">
                  {formatRelative(tpl.updatedAt)}
                </span>

                <div className="flex shrink-0 items-center gap-1">
                  <Link
                    href={`/app/leads/proposals/${tpl.id}/edit`}
                    className="grid h-11 w-11 place-items-center rounded-v2-sm text-brand-600 hover:bg-brand-50 dark:text-brand-400 dark:hover:bg-brand-500/10"
                    title="Редактировать"
                    aria-label="Редактировать"
                  >
                    <Pencil className="h-4 w-4" />
                  </Link>
                  <button
                    type="button"
                    onClick={() => handleDelete(tpl.id, tpl.name || 'без имени')}
                    className="grid h-11 w-11 place-items-center rounded-v2-sm text-[hsl(var(--muted))] hover:bg-[var(--signal-hot-bg)] hover:text-[color:var(--signal-hot)]"
                    title="Удалить"
                    aria-label="Удалить"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </CardV2>
            </li>
          ))}
        </ul>
      )}

      <ToastContainer toasts={toasts} onClose={(id) => setToasts((t) => t.filter((x) => x.id !== id))} />
    </div>
  );
}

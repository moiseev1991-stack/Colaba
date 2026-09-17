'use client';

/**
 * §4.4 ТЗ редизайна 2026-06-03 — Шаблоны КП.
 * Вид Premium (17.09): общий PageHeader, карточки-строки как в «Списках», EmptyState.
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

import { Badge } from '@/components/ui/badge';
import { buttonClass } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/Skeleton';
import { confirmDialog } from '@/components/ui/confirm';
import { toast } from '@/components/ui/toast';
import { PageContainer, PageHeader } from '@/components/ui/page';
import { EmptyState } from '@/components/ui/states';
import { pluralRu } from '@/lib/utils';

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
  // localStorage недоступен на сервере — читаем после mount.
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setItems(listTemplates());
    setHydrated(true);
  }, []);

  const refresh = () => setItems(listTemplates());

  const handleDelete = async (id: string, name: string) => {
    if (!(await confirmDialog(`Удалить шаблон «${name}»?`))) return;
    deleteTemplate(id);
    refresh();
    toast.success('Шаблон удалён');
  };

  const countLabel = hydrated
    ? `${items.length} ${pluralRu(items.length, ['шаблон', 'шаблона', 'шаблонов'])}`
    : null;

  return (
    <PageContainer>
      <PageHeader
        title="Шаблоны КП"
        description="Один раз пишете шаблон с переменными — SpinLid подставляет имя компании, домен и контакт в каждое письмо. Шаблонов может быть несколько под разные ситуации."
        actions={
          <Link href="/app/leads/proposals/new" className={buttonClass({ className: 'gap-1.5' })}>
            <Plus className="h-4 w-4" aria-hidden />
            Новый шаблон
          </Link>
        }
      />
      {!hydrated ? (
        <div className="flex flex-col gap-2.5" aria-busy="true">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-[76px]" rounded="lg" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={<FileText className="h-6 w-6" aria-hidden />}
          title="Пока нет ни одного шаблона"
          description="Создайте первый шаблон — потом его можно отправлять выбранным компаниям с подстановкой имени и контакта."
          action={
            <Link href="/app/leads/proposals/new" className={buttonClass()}>
              Создать шаблон
            </Link>
          }
        />
      ) : (
        <>
          <p className="mb-3 text-small text-ui-text-muted">{countLabel}</p>
          <ul className="flex flex-col gap-2.5">
            {items.map((tpl) => (
              <li
                key={tpl.id}
                className="relative flex items-center gap-4 rounded-panel border border-black/[.05] bg-ui-surface p-4 shadow-raised transition-all hover:-translate-y-0.5 hover:shadow-floating sm:px-5"
              >
                <Badge tone="accent" icon={CHANNEL_ICON[tpl.channel]} className="shrink-0">
                  {CHANNEL_LABEL[tpl.channel]}
                </Badge>

                <div className="min-w-0 flex-1">
                  {/* Ссылка на редактор растянута на всю карточку; кнопки лежат поверх. */}
                  <Link
                    href={`/app/leads/proposals/${tpl.id}/edit`}
                    className="block truncate text-base font-bold text-ui-text after:absolute after:inset-0 after:rounded-panel after:content-['']"
                  >
                    {tpl.name || <span className="text-ui-text-muted">Без названия</span>}
                  </Link>
                  <p
                    className="mt-0.5 truncate text-small text-ui-text-muted"
                    title={tpl.subject || tpl.body}
                  >
                    {tpl.channel === 'email' && tpl.subject
                      ? `Тема: ${tpl.subject}`
                      : tpl.body.slice(0, 90)}
                  </p>
                </div>

                <span className="hidden shrink-0 text-small text-ui-text-muted sm:inline">
                  {formatRelative(tpl.updatedAt)}
                </span>

                <div className="relative z-10 flex shrink-0 items-center gap-1">
                  <Link
                    href={`/app/leads/proposals/${tpl.id}/edit`}
                    className={buttonClass({
                      variant: 'ghost',
                      size: 'icon',
                      className: 'text-ui-text-muted hover:text-ui-accent',
                    })}
                    title="Редактировать"
                    aria-label={`Редактировать шаблон «${tpl.name || 'без названия'}»`}
                  >
                    <Pencil className="h-4 w-4" aria-hidden />
                  </Link>
                  <button
                    type="button"
                    onClick={() => handleDelete(tpl.id, tpl.name || 'без названия')}
                    className={buttonClass({
                      variant: 'ghost',
                      size: 'icon',
                      className: 'text-ui-text-muted hover:bg-ui-danger/10 hover:text-ui-danger',
                    })}
                    title="Удалить"
                    aria-label={`Удалить шаблон «${tpl.name || 'без названия'}»`}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </PageContainer>
  );
}

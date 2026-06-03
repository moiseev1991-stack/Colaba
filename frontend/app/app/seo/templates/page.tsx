'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Plus, Pencil, Trash2, FileText } from 'lucide-react';
import { ButtonV2 } from '@/components/ui/ButtonV2';
import { CardV2 } from '@/components/ui/CardV2';
import { ToastContainer, type Toast } from '@/components/Toast';
import {
  getOutreachTemplates,
  getOutreachTemplatesSync,
  deleteOutreachTemplate,
  type OutreachTemplate,
} from '@/src/services/api/outreachTemplates';

// §4.9 ТЗ редизайна 2026-06-03 (Phase C batch 2): шаблоны КП на v2.
const CODE_CLS = 'text-xs px-1.5 py-0.5 rounded-v2-sm font-mono';
const CODE_STYLE = { background: 'hsl(var(--surface-2))', color: 'hsl(var(--text))' } as const;

export default function SeoTemplatesPage() {
  const [templates, setTemplates] = useState<OutreachTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = (type: Toast['type'], message: string) => {
    setToasts((prev) => [...prev, { id: Date.now().toString(), type, message }]);
  };

  const load = useCallback(async () => {
    setLoading(true);
    const local = getOutreachTemplatesSync();
    if (local.length > 0) {
      setTemplates(local);
      setLoading(false);
    }
    try {
      const data = await getOutreachTemplates();
      setTemplates(data);
    } catch {
      if (local.length === 0) setTemplates([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleDelete = async (id: number, name: string) => {
    if (!confirm(`Удалить шаблон «${name}»?`)) return;
    try {
      await deleteOutreachTemplate(id);
      addToast('success', 'Шаблон удалён');
      load();
    } catch {
      addToast('error', 'Не удалось удалить шаблон');
    }
  };

  return (
    <div className="mx-auto w-full max-w-7xl min-w-0 px-4 py-6 sm:px-6 sm:py-8 overflow-x-hidden">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <h1
          className="flex items-center gap-2 font-display font-semibold tracking-tight"
          style={{ fontSize: 'clamp(1.5rem, 3vw, 2rem)', color: 'hsl(var(--text))' }}
        >
          <FileText className="h-5 w-5 text-brand-600 dark:text-brand-400" />
          Шаблоны коммерческих предложений
        </h1>
        <Link href="/app/seo/templates/new" className="contents">
          <ButtonV2 variant="primary" size="md" iconLeft={<Plus />}>
            Создать шаблон
          </ButtonV2>
        </Link>
      </div>

      <p className="text-[13px] mb-2" style={{ color: 'hsl(var(--muted))' }}>
        Шаблоны используются при запуске SEO-поиска. В тексте можно использовать плейсхолдеры:{' '}
        <code className={CODE_CLS} style={CODE_STYLE}>&#123;&#123;domain&#125;&#125;</code>,{' '}
        <code className={CODE_CLS} style={CODE_STYLE}>&#123;&#123;issues&#125;&#125;</code>,{' '}
        <code className={CODE_CLS} style={CODE_STYLE}>&#123;&#123;score&#125;&#125;</code> и др.
      </p>
      <p className="text-xs mb-6" style={{ color: 'hsl(var(--muted))' }}>
        Данные сохраняются в браузере (localStorage). После подключения бэкенда шаблоны будут синхронизироваться.
      </p>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 rounded-v2-lg skel-v2" />
          ))}
        </div>
      ) : templates.length === 0 ? (
        <CardV2 className="p-12 text-center bg-mesh-brand">
          <div className="inline-flex items-center justify-center rounded-v2-sm bg-brand-50 dark:bg-brand-500/10 p-3 mb-4">
            <FileText className="h-8 w-8 text-brand-600 dark:text-brand-400" />
          </div>
          <p
            className="font-display font-semibold tracking-tight text-[15px] mb-1"
            style={{ color: 'hsl(var(--text))' }}
          >
            Шаблонов пока нет
          </p>
          <p className="text-[13px] mb-6" style={{ color: 'hsl(var(--muted))' }}>
            Создайте первый шаблон — он будет подставляться при генерации outreach для SEO-результатов.
          </p>
          <Link href="/app/seo/templates/new" className="contents">
            <ButtonV2 variant="primary" size="md" iconLeft={<Plus />}>
              Создать шаблон
            </ButtonV2>
          </Link>
        </CardV2>
      ) : (
        <ul className="reveal-stack space-y-3">
          {templates.map((t) => (
            <li key={t.id}>
              <CardV2
                interactive
                reveal
                className="p-4 flex flex-wrap items-center justify-between gap-4"
              >
                <div className="min-w-0 flex-1">
                  <h3
                    className="font-display font-semibold tracking-tight text-[15px] truncate"
                    style={{ color: 'hsl(var(--text))' }}
                  >
                    {t.name}
                  </h3>
                  <p className="text-[12px] mt-1 truncate" style={{ color: 'hsl(var(--muted))' }}>
                    Тема: {t.subject || '—'}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Link href={`/app/seo/templates/${t.id}/edit`} className="contents">
                    <ButtonV2 variant="secondary" size="sm" iconLeft={<Pencil />}>
                      Редактировать
                    </ButtonV2>
                  </Link>
                  <ButtonV2
                    variant="danger"
                    size="sm"
                    iconLeft={<Trash2 />}
                    onClick={() => handleDelete(t.id, t.name)}
                  >
                    Удалить
                  </ButtonV2>
                </div>
              </CardV2>
            </li>
          ))}
        </ul>
      )}

      <ToastContainer toasts={toasts} onClose={(id) => setToasts((x) => x.filter((t) => t.id !== id))} />
    </div>
  );
}

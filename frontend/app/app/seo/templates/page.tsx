'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Plus, Pencil, Trash2, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ToastContainer, type Toast } from '@/components/Toast';
import {
  getOutreachTemplates,
  getOutreachTemplatesSync,
  deleteOutreachTemplate,
  type OutreachTemplate,
} from '@/src/services/api/outreachTemplates';

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
    <div className="mx-auto w-full max-w-[900px] min-w-0 px-6 py-8 overflow-x-hidden">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <h1 className="text-[20px] font-semibold" style={{ color: 'hsl(var(--text))' }}>
          Шаблоны коммерческих предложений
        </h1>
        <Link href="/app/seo/templates/new">
          <Button className="flex items-center gap-2">
            <Plus className="h-4 w-4" />
            Создать шаблон
          </Button>
        </Link>
      </div>

      <p className="text-[13px] text-gray-600 dark:text-gray-400 mb-2">
        Шаблоны используются при запуске SEO-поиска. В тексте можно использовать плейсхолдеры:{' '}
        <code className="text-xs bg-gray-100 dark:bg-gray-800 px-1 rounded">&#123;&#123;domain&#125;&#125;</code>,{' '}
        <code className="text-xs bg-gray-100 dark:bg-gray-800 px-1 rounded">&#123;&#123;issues&#125;&#125;</code>,{' '}
        <code className="text-xs bg-gray-100 dark:bg-gray-800 px-1 rounded">&#123;&#123;score&#125;&#125;</code> и др.
      </p>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-6">
        Данные сохраняются в браузере (localStorage). После подключения бэкенда шаблоны будут синхронизироваться.
      </p>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 rounded-[12px] bg-gray-100 dark:bg-gray-800 animate-pulse" />
          ))}
        </div>
      ) : templates.length === 0 ? (
        <div
          className="app-card-enhanced p-12 text-center"
          style={{ borderColor: 'hsl(var(--border))' }}
        >
          <FileText className="h-12 w-12 mx-auto mb-4 text-gray-400 dark:text-gray-500" />
          <p className="text-[15px] font-medium mb-1" style={{ color: 'hsl(var(--text))' }}>
            Шаблонов пока нет
          </p>
          <p className="text-[13px] text-gray-600 dark:text-gray-400 mb-6">
            Создайте первый шаблон — он будет подставляться при генерации outreach для SEO-результатов.
          </p>
          <Link href="/app/seo/templates/new">
            <Button>Создать шаблон</Button>
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {templates.map((t) => (
            <div
              key={t.id}
              className="app-card-enhanced p-4 flex flex-wrap items-center justify-between gap-4"
            >
              <div className="min-w-0 flex-1">
                <h3 className="text-[15px] font-semibold truncate" style={{ color: 'hsl(var(--text))' }}>
                  {t.name}
                </h3>
                <p className="text-[12px] text-gray-500 dark:text-gray-400 mt-1 truncate">
                  Тема: {t.subject || '—'}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Link href={`/app/seo/templates/${t.id}/edit`}>
                  <Button variant="outline" size="sm" className="gap-1.5">
                    <Pencil className="h-3.5 w-3.5" />
                    Редактировать
                  </Button>
                </Link>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 text-red-600 hover:text-red-700 hover:border-red-300 dark:hover:border-red-700"
                  onClick={() => handleDelete(t.id, t.name)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Удалить
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <ToastContainer toasts={toasts} onClose={(id) => setToasts((x) => x.filter((t) => t.id !== id))} />
    </div>
  );
}

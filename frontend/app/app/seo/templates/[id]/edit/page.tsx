'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ToastContainer, type Toast } from '@/components/Toast';
import {
  getOutreachTemplates,
  updateOutreachTemplate,
  PLACEHOLDERS,
  type OutreachTemplate,
  type OutreachTemplateCreate,
} from '@/src/services/api/outreachTemplates';

export default function EditTemplatePage() {
  const router = useRouter();
  const params = useParams();
  const id = params?.id ? Number(params.id) : NaN;

  const [template, setTemplate] = useState<OutreachTemplate | null>(null);
  const [form, setForm] = useState<OutreachTemplateCreate>({ name: '', subject: '', body: '', module: 'seo' });
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = (type: Toast['type'], message: string) => {
    setToasts((prev) => [...prev, { id: Date.now().toString(), type, message }]);
  };

  useEffect(() => {
    if (isNaN(id)) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const list = await getOutreachTemplates();
        const t = list.find((x) => x.id === id);
        if (cancelled) return;
        if (t) {
          setTemplate(t);
          setForm({ name: t.name, subject: t.subject, body: t.body, module: t.module || 'seo' });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.subject.trim() || !form.body.trim()) {
      addToast('error', 'Заполните все поля');
      return;
    }
    if (isNaN(id)) return;
    setSubmitting(true);
    try {
      await updateOutreachTemplate(id, form);
      addToast('success', 'Шаблон сохранён');
      router.push('/app/seo/templates');
    } catch {
      addToast('error', 'API шаблонов ещё не готово. Бэкенд в разработке.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-[700px] px-6 py-8 flex items-center justify-center gap-2 text-gray-500">
        <Loader2 className="h-5 w-5 animate-spin" />
        Загрузка…
      </div>
    );
  }

  if (!template) {
    return (
      <div className="mx-auto max-w-[700px] px-6 py-8">
        <p className="text-gray-600 dark:text-gray-400 mb-4">Шаблон не найден</p>
        <Link href="/app/seo/templates">
          <Button variant="outline">К списку шаблонов</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[700px] min-w-0 px-6 py-8 overflow-x-hidden">
      <Link
        href="/app/seo/templates"
        className="inline-flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 mb-6"
      >
        <ArrowLeft className="h-4 w-4" />
        К списку шаблонов
      </Link>

      <h1 className="text-[20px] font-semibold mb-6" style={{ color: 'hsl(var(--text))' }}>
        Редактировать шаблон
      </h1>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="app-card-enhanced p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Название шаблона
            </label>
            <Input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Например: SEO короткий"
              className="w-full"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Тема письма
            </label>
            <Input
              value={form.subject}
              onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
              placeholder="Рекомендации по SEO для {{domain}}"
              className="w-full"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Текст письма
            </label>
            <textarea
              value={form.body}
              onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
              rows={10}
              className="w-full rounded-[10px] border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-saas-primary"
            />
          </div>
          <div className="rounded-[10px] bg-gray-50 dark:bg-gray-800/50 p-3 text-[12px]">
            <p className="font-medium text-gray-700 dark:text-gray-300 mb-2">Доступные плейсхолдеры:</p>
            <div className="flex flex-wrap gap-2">
              {PLACEHOLDERS.map(({ key }) => (
                <code key={key} className="px-2 py-0.5 rounded bg-gray-200 dark:bg-gray-700">
                  {key}
                </code>
              ))}
            </div>
          </div>
        </div>

        <div className="flex gap-3">
          <Button type="submit" disabled={submitting}>
            {submitting ? 'Сохранение…' : 'Сохранить'}
          </Button>
          <Link href="/app/seo/templates">
            <Button type="button" variant="outline">
              Отмена
            </Button>
          </Link>
        </div>
      </form>

      <ToastContainer toasts={toasts} onClose={(id) => setToasts((x) => x.filter((t) => t.id !== id))} />
    </div>
  );
}

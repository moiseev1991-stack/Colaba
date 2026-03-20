'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ToastContainer, type Toast } from '@/components/Toast';
import {
  createOutreachTemplate,
  PLACEHOLDERS,
  type OutreachTemplateCreate,
} from '@/src/services/api/outreachTemplates';

export default function NewTemplatePage() {
  const router = useRouter();
  const [form, setForm] = useState<OutreachTemplateCreate>({
    name: '',
    subject: 'SEO рекомендации для {{domain}}',
    body: `Здравствуйте!

Я проанализировал ваш сайт {{domain}} и обнаружил несколько SEO проблем:
- {{issues}}

Оценка сайта: {{score}}/100. Могу помочь улучшить позиции в поиске.

С уважением`,
    module: 'seo',
  });
  const [submitting, setSubmitting] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = (type: Toast['type'], message: string) => {
    setToasts((prev) => [...prev, { id: Date.now().toString(), type, message }]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.subject.trim() || !form.body.trim()) {
      addToast('error', 'Заполните все поля');
      return;
    }
    setSubmitting(true);
    try {
      await createOutreachTemplate(form);
      addToast('success', 'Шаблон создан');
      router.push('/app/seo/templates');
    } catch {
      addToast('error', 'API шаблонов ещё не готово. Бэкенд в разработке.');
    } finally {
      setSubmitting(false);
    }
  };

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
        Новый шаблон КП
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
              placeholder="Здравствуйте!&#10;&#10;Я проанализировал {{domain}}..."
              rows={10}
              className="w-full rounded-[10px] border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-saas-primary"
            />
          </div>
          <div className="rounded-[10px] bg-gray-50 dark:bg-gray-800/50 p-3 text-[12px]">
            <p className="font-medium text-gray-700 dark:text-gray-300 mb-2">Доступные плейсхолдеры:</p>
            <div className="flex flex-wrap gap-2">
              {PLACEHOLDERS.map(({ key, desc }) => (
                <span
                  key={key}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300"
                  title={desc}
                >
                  <code>{key}</code>
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="flex gap-3">
          <Button type="submit" disabled={submitting}>
            {submitting ? 'Создание…' : 'Создать шаблон'}
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

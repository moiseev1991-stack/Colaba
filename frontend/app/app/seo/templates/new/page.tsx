'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, FileText, Save } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { ButtonV2 } from '@/components/ui/ButtonV2';
import { CardV2 } from '@/components/ui/CardV2';
import { ToastContainer, type Toast } from '@/components/Toast';
import {
  createOutreachTemplate,
  PLACEHOLDERS,
  type OutreachTemplateCreate,
} from '@/src/services/api/outreachTemplates';

// §4.9 ТЗ редизайна 2026-06-03 (Phase C batch 2): new template на v2.
const LABEL_CLS = 'block text-sm font-medium mb-1';

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
    <div className="mx-auto w-full max-w-[760px] min-w-0 px-4 py-6 sm:px-6 sm:py-8 overflow-x-hidden">
      <Link
        href="/app/seo/templates"
        className="inline-flex items-center gap-2 text-sm mb-6 transition-colors hover:text-[hsl(var(--text))]"
        style={{ color: 'hsl(var(--muted))' }}
      >
        <ArrowLeft className="h-4 w-4" />
        К списку шаблонов
      </Link>

      <h1
        className="flex items-center gap-2 mb-6 font-display font-semibold tracking-tight"
        style={{ fontSize: 'clamp(1.5rem, 3vw, 2rem)', color: 'hsl(var(--text))' }}
      >
        <FileText className="h-5 w-5 text-brand-600 dark:text-brand-400" />
        Новый шаблон КП
      </h1>

      <form onSubmit={handleSubmit} className="space-y-6">
        <CardV2 className="p-6 space-y-4">
          <div>
            <label className={LABEL_CLS} style={{ color: 'hsl(var(--text))' }}>
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
            <label className={LABEL_CLS} style={{ color: 'hsl(var(--text))' }}>
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
            <label className={LABEL_CLS} style={{ color: 'hsl(var(--text))' }}>
              Текст письма
            </label>
            <textarea
              value={form.body}
              onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
              placeholder="Здравствуйте!&#10;&#10;Я проанализировал {{domain}}..."
              rows={10}
              className="w-full rounded-v2-sm border px-3 py-2 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500"
              style={{
                background: 'hsl(var(--surface))',
                borderColor: 'hsl(var(--border))',
                color: 'hsl(var(--text))',
              }}
            />
          </div>
          <div
            className="rounded-v2-sm p-3 text-[12px]"
            style={{ background: 'hsl(var(--surface-2))' }}
          >
            <p className="font-medium mb-2" style={{ color: 'hsl(var(--text))' }}>
              Доступные плейсхолдеры:
            </p>
            <div className="flex flex-wrap gap-2">
              {PLACEHOLDERS.map(({ key, desc }) => (
                <span
                  key={key}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-v2-sm border"
                  style={{
                    background: 'hsl(var(--surface))',
                    borderColor: 'hsl(var(--border))',
                    color: 'hsl(var(--text))',
                  }}
                  title={desc}
                >
                  <code className="font-mono">{key}</code>
                </span>
              ))}
            </div>
          </div>
        </CardV2>

        <div className="flex gap-3">
          <ButtonV2
            type="submit"
            variant="primary"
            size="md"
            iconLeft={<Save />}
            loading={submitting}
          >
            Создать шаблон
          </ButtonV2>
          <Link href="/app/seo/templates" className="contents">
            <ButtonV2 type="button" variant="secondary" size="md">
              Отмена
            </ButtonV2>
          </Link>
        </div>
      </form>

      <ToastContainer toasts={toasts} onClose={(id) => setToasts((x) => x.filter((t) => t.id !== id))} />
    </div>
  );
}

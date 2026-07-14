'use client';

/**
 * /app/leads/templates — CRUD email-шаблонов для outreach.
 *
 * Шаблон = {name, subject, body, pain_key}. Опциональная привязка pain_key
 * позволяет на /app/pains для выбранной боли предложить только подходящие
 * шаблоны + универсальные. Универсальный = pain_key IS NULL.
 *
 * Плейсхолдеры (subject/body): {{company}} {{city}} {{niche}} {{pain}}
 * {{quote}} {{mentions}} {{negative}} {{rating}} {{phone}} {{website}} {{address}}.
 * Подстановка происходит на /app/pains при клике «✉ Написать».
 */

import { useEffect, useState } from 'react';

import {
  createOutreachTemplate,
  deleteOutreachTemplate,
  getOutreachTemplates,
  updateOutreachTemplate,
  type OutreachTemplate,
} from '@/src/services/api/outreachTemplates';
import { PAIN_KEY_LABELS, type PainKey } from '@/src/services/api/maps';

const PAIN_KEYS: PainKey[] = [
  'call_no_answer',
  'callback_lost',
  'schedule_hard',
  'schedule_wait',
  'queue_wait',
  'admin_rude',
  'unclear_pricing',
  'food_slow',
];

const PLACEHOLDERS: Array<[string, string]> = [
  ['{{company}}', 'Название компании'],
  ['{{city}}', 'Город'],
  ['{{niche}}', 'Ниша'],
  ['{{pain}}', 'Активная боль (label)'],
  ['{{quote}}', 'Топ-цитата отзыва'],
  ['{{mentions}}', 'Кол-во упоминаний боли'],
  ['{{negative}}', 'Всего негативных отзывов'],
  ['{{rating}}', 'Рейтинг ★'],
  ['{{phone}}', 'Телефон компании'],
  ['{{website}}', 'Сайт'],
  ['{{address}}', 'Адрес'],
];

const EMPTY_FORM = {
  id: null as number | null,
  name: '',
  subject: '',
  body: '',
  pain_key: '' as string,
};

export default function TemplatesPage() {
  const [items, setItems] = useState<OutreachTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [filterPain, setFilterPain] = useState<string>('');

  const reload = async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await getOutreachTemplates({ module: 'leads' });
      setItems(rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось загрузить');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void reload(); }, []);

  const startEdit = (t: OutreachTemplate) => {
    setForm({
      id: t.id,
      name: t.name,
      subject: t.subject,
      body: t.body,
      pain_key: t.pain_key ?? '',
    });
  };

  const cancelEdit = () => setForm({ ...EMPTY_FORM });

  const save = async () => {
    if (!form.name.trim() || !form.subject.trim() || !form.body.trim()) {
      setError('Заполни name / subject / body');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (form.id) {
        await updateOutreachTemplate(form.id, {
          name: form.name.trim(),
          subject: form.subject.trim(),
          body: form.body.trim(),
          pain_key: form.pain_key || null,
        });
      } else {
        await createOutreachTemplate({
          name: form.name.trim(),
          subject: form.subject.trim(),
          body: form.body.trim(),
          module: 'leads',
          pain_key: form.pain_key || null,
        });
      }
      setForm({ ...EMPTY_FORM });
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось сохранить');
    } finally {
      setSaving(false);
    }
  };

  const del = async (id: number) => {
    if (!confirm('Удалить шаблон?')) return;
    try {
      await deleteOutreachTemplate(id);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось удалить');
    }
  };

  const filtered = filterPain
    ? items.filter((t) => t.pain_key === filterPain || !t.pain_key)
    : items;

  return (
    <div className="mx-auto w-full max-w-[1200px] px-3 sm:px-6 pt-4 sm:pt-6 space-y-4">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold text-slate-900">Шаблоны писем</h1>
        <p className="text-sm text-slate-500">
          Заготовки для outreach. Опциональная привязка к боли — на «Поиск по боли»
          для выбранной боли будут предлагаться только подходящие шаблоны + универсальные.
        </p>
      </header>

      {/* Форма создания/редактирования */}
      <section className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-medium text-slate-800">
            {form.id ? `Редактировать «${form.name}»` : 'Новый шаблон'}
          </h2>
          {form.id && (
            <button
              type="button"
              onClick={cancelEdit}
              className="text-xs text-slate-500 hover:text-slate-700 underline underline-offset-2"
            >
              Отмена, создать новый
            </button>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm">
            <span className="mb-1 block font-medium text-slate-700">Название</span>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder='например: «Стома — не могут дозвониться»'
              className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium text-slate-700">Привязка к боли (опц.)</span>
            <select
              value={form.pain_key}
              onChange={(e) => setForm((f) => ({ ...f, pain_key: e.target.value }))}
              className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            >
              <option value="">— универсальный —</option>
              {PAIN_KEYS.map((k) => (
                <option key={k} value={k}>
                  {PAIN_KEY_LABELS[k]}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="text-sm block">
          <span className="mb-1 block font-medium text-slate-700">Тема письма</span>
          <input
            type="text"
            value={form.subject}
            onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
            placeholder="{{company}}: {{negative}} негативных отзывов — можно помочь"
            className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
          />
        </label>

        <label className="text-sm block">
          <span className="mb-1 block font-medium text-slate-700">Тело письма</span>
          <textarea
            value={form.body}
            onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
            rows={10}
            placeholder={`Здравствуйте!\n\nЯ увидел «{{company}}» в {{city}} — {{negative}} негативных отзывов, чаще всего клиенты жалуются: «{{quote}}».\n\nМогу настроить автоответчик, чтобы не терять эти лиды...`}
            className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm font-mono"
          />
        </label>

        <div className="rounded-md border border-slate-100 bg-slate-50 p-2 text-xs space-y-1">
          <div className="font-medium text-slate-600">Плейсхолдеры (клик = скопировать):</div>
          <div className="flex flex-wrap gap-1">
            {PLACEHOLDERS.map(([key, desc]) => (
              <button
                type="button"
                key={key}
                onClick={() => {
                  navigator.clipboard?.writeText(key).catch(() => {/* no-op */});
                }}
                className="rounded border border-slate-300 bg-white px-1.5 py-0.5 font-mono text-[10.5px] text-slate-700 hover:bg-slate-100"
                title={desc}
              >
                {key}
              </button>
            ))}
          </div>
        </div>

        {error && <p className="text-sm text-rose-600">{error}</p>}

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="rounded-md bg-slate-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-slate-700 disabled:bg-slate-400"
          >
            {saving ? 'Сохраняем…' : form.id ? 'Сохранить' : 'Создать'}
          </button>
          <span className="text-xs text-slate-500">
            Всего шаблонов: {items.length}
          </span>
        </div>
      </section>

      {/* Список */}
      <section className="space-y-2">
        <div className="flex items-center gap-2">
          <label className="text-xs text-slate-500">Фильтр:</label>
          <select
            value={filterPain}
            onChange={(e) => setFilterPain(e.target.value)}
            className="rounded-md border border-slate-300 px-2 py-1 text-sm"
          >
            <option value="">Все шаблоны</option>
            {PAIN_KEYS.map((k) => (
              <option key={k} value={k}>
                Для «{PAIN_KEY_LABELS[k]}»
              </option>
            ))}
          </select>
          <span className="text-xs text-slate-500">
            Показано {filtered.length} из {items.length}
          </span>
        </div>

        {loading && <p className="text-sm text-slate-500">Загружаем…</p>}
        {!loading && filtered.length === 0 && (
          <p className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600 text-center">
            Пока нет шаблонов. Создай первый в форме выше.
          </p>
        )}

        <div className="grid gap-2">
          {filtered.map((t) => (
            <article
              key={t.id}
              className="rounded-xl border border-slate-200 bg-white p-3 space-y-1"
            >
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-medium text-slate-900">{t.name}</h3>
                {t.pain_key ? (
                  <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[11px] text-rose-700">
                    {PAIN_KEY_LABELS[t.pain_key as PainKey] ?? t.pain_key}
                  </span>
                ) : (
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">
                    универсальный
                  </span>
                )}
                <div className="ml-auto flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => startEdit(t)}
                    className="rounded border border-slate-300 bg-white px-2 py-0.5 text-xs text-slate-700 hover:bg-slate-100"
                  >
                    ✏ Ред.
                  </button>
                  <button
                    type="button"
                    onClick={() => void del(t.id)}
                    className="rounded border border-rose-200 bg-white px-2 py-0.5 text-xs text-rose-700 hover:bg-rose-50"
                  >
                    🗑 Удалить
                  </button>
                </div>
              </div>
              <div className="text-xs text-slate-500 truncate">
                <span className="font-mono">Тема:</span> {t.subject}
              </div>
              <div className="whitespace-pre-wrap text-xs text-slate-700 line-clamp-3 font-mono bg-slate-50 rounded p-1.5">
                {t.body}
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

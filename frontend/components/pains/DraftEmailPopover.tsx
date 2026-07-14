'use client';

/**
 * Popover «✉ Написать» — на карточке /app/pains.
 *
 * Открывается кликом на кнопку рядом с карточкой компании. Юзер:
 *  1. Выбирает шаблон из списка (фильтр по pain_key активной боли + универсальные).
 *  2. Видит preview subject/body с подставленными {{плейсхолдерами}}.
 *  3. Копирует в буфер / открывает mailto / скачивает как .eml.
 *
 * Никаких запросов на отправку письма отсюда — юзер сам решает через
 * какой канал слать. Это MVP-инструмент «черновик», не автомат-рассылка.
 */

import { useEffect, useMemo, useState } from 'react';

import {
  getOutreachTemplates,
  type OutreachTemplate,
} from '@/src/services/api/outreachTemplates';

export interface CompanyForDraft {
  id: number;
  name: string;
  address?: string | null;
  phone?: string | null;
  website?: string | null;
  city?: string | null;
  niche?: string | null;
  rating?: number | null;
  reviews_negative_count?: number;
  pain_mention_count?: number;
  top_quote?: string | null;
}

interface Props {
  open: boolean;
  companies: CompanyForDraft[]; // ровно одна = per-card, несколько = батч
  painLabel: string;
  painKey?: string | null; // для фильтра шаблонов
  onClose: () => void;
}

function substitute(text: string, c: CompanyForDraft, painLabel: string): string {
  const map: Record<string, string> = {
    '{{company}}': c.name || '',
    '{{city}}': c.city || '',
    '{{niche}}': c.niche || '',
    '{{pain}}': painLabel || '',
    '{{quote}}': c.top_quote || '',
    '{{mentions}}': String(c.pain_mention_count ?? ''),
    '{{negative}}': String(c.reviews_negative_count ?? ''),
    '{{rating}}': c.rating != null ? c.rating.toFixed(1) : '',
    '{{phone}}': c.phone || '',
    '{{website}}': c.website ?? '',
    '{{address}}': c.address || '',
  };
  let out = text;
  for (const [k, v] of Object.entries(map)) {
    out = out.split(k).join(v);
  }
  return out;
}

export function DraftEmailPopover({ open, companies, painLabel, painKey, onClose }: Props) {
  const [templates, setTemplates] = useState<OutreachTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [previewIdx, setPreviewIdx] = useState(0);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    getOutreachTemplates({ pain_key: painKey ?? undefined, module: 'leads' })
      .then((rows) => {
        if (cancelled) return;
        setTemplates(rows);
        if (rows.length > 0 && selectedId == null) {
          setSelectedId(rows[0].id);
        }
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, painKey]);

  const selected = useMemo(
    () => templates.find((t) => t.id === selectedId) ?? null,
    [templates, selectedId],
  );

  const currentCompany = companies[previewIdx] ?? companies[0];

  const preview = useMemo(() => {
    if (!selected || !currentCompany) return null;
    return {
      subject: substitute(selected.subject, currentCompany, painLabel),
      body: substitute(selected.body, currentCompany, painLabel),
    };
  }, [selected, currentCompany, painLabel]);

  const copyAll = async () => {
    if (!preview) return;
    // Подставим для каждой компании отдельно и склеим — юзер поймёт что это
    // batch (шапка «=== Company X ===» + subject + body).
    const parts = companies.map((c) => {
      const s = substitute(selected!.subject, c, painLabel);
      const b = substitute(selected!.body, c, painLabel);
      return `=== ${c.name} ===\nTo: (email компании неизвестен)\nSubject: ${s}\n\n${b}`;
    });
    await navigator.clipboard.writeText(parts.join('\n\n---\n\n'));
    alert(`Скопировано ${companies.length} писем в буфер`);
  };

  const copyOne = async () => {
    if (!preview) return;
    await navigator.clipboard.writeText(
      `Subject: ${preview.subject}\n\n${preview.body}`,
    );
    alert('Скопировано в буфер');
  };

  const mailto = () => {
    if (!preview || !currentCompany) return;
    // mailto: не открывается для батча (у каждой компании свой адрес),
    // работает только для одной. Юзер обычно email не знает — открываем
    // mailto: без адресата, он вставит вручную.
    const s = encodeURIComponent(preview.subject);
    const b = encodeURIComponent(preview.body);
    window.location.href = `mailto:?subject=${s}&body=${b}`;
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 overflow-auto"
      onClick={onClose}
    >
      <div
        className="mt-16 w-full max-w-3xl rounded-xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-slate-200 px-4 py-2">
          <div>
            <h3 className="font-semibold text-slate-900">
              ✉ Написать письмо
              {companies.length > 1 && (
                <span className="ml-2 text-xs text-slate-500">
                  ({companies.length} компаний батчем)
                </span>
              )}
            </h3>
            <p className="text-xs text-slate-500">
              Боль: «{painLabel}»
              {companies.length === 1 && ` · ${companies[0].name}`}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-slate-500 hover:bg-slate-100"
          >
            ×
          </button>
        </header>

        <div className="p-4 space-y-3">
          {loading && <p className="text-sm text-slate-500">Загружаем шаблоны…</p>}

          {!loading && templates.length === 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 space-y-2">
              <p>
                У тебя ещё нет шаблонов
                {painKey && ` для этой боли или универсальных`}.
              </p>
              <a
                href="/app/leads/templates"
                target="_blank"
                rel="noreferrer"
                className="inline-block rounded-md bg-amber-600 px-3 py-1 text-xs font-medium text-white hover:bg-amber-700"
              >
                Создать шаблон →
              </a>
            </div>
          )}

          {templates.length > 0 && (
            <label className="text-sm block">
              <span className="mb-1 block font-medium text-slate-700">
                Шаблон {painKey && '(с фильтром по боли + универсальные)'}
              </span>
              <select
                value={selectedId ?? ''}
                onChange={(e) => setSelectedId(Number(e.target.value))}
                className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
              >
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                    {t.pain_key ? ` · ${t.pain_key}` : ' · универсальный'}
                  </option>
                ))}
              </select>
            </label>
          )}

          {companies.length > 1 && (
            <div className="flex items-center gap-2 text-xs">
              <span className="text-slate-500">Preview для:</span>
              <button
                type="button"
                onClick={() => setPreviewIdx((i) => Math.max(0, i - 1))}
                disabled={previewIdx === 0}
                className="rounded border border-slate-300 bg-white px-1.5 py-0.5 disabled:opacity-50"
              >
                ←
              </button>
              <span className="font-medium">
                {previewIdx + 1} / {companies.length}: {currentCompany?.name}
              </span>
              <button
                type="button"
                onClick={() => setPreviewIdx((i) => Math.min(companies.length - 1, i + 1))}
                disabled={previewIdx >= companies.length - 1}
                className="rounded border border-slate-300 bg-white px-1.5 py-0.5 disabled:opacity-50"
              >
                →
              </button>
            </div>
          )}

          {preview && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-2">
              <div>
                <div className="text-[11px] uppercase tracking-wider text-slate-500 font-medium mb-1">
                  Subject
                </div>
                <div className="rounded border border-slate-200 bg-white px-2 py-1 text-sm">
                  {preview.subject}
                </div>
              </div>
              <div>
                <div className="text-[11px] uppercase tracking-wider text-slate-500 font-medium mb-1">
                  Body
                </div>
                <textarea
                  readOnly
                  value={preview.body}
                  rows={10}
                  className="w-full rounded border border-slate-200 bg-white px-2 py-1 text-sm font-mono"
                />
              </div>
            </div>
          )}

          {preview && (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={copyOne}
                className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-700"
              >
                📋 Копировать текущее
              </button>
              {companies.length > 1 && (
                <button
                  type="button"
                  onClick={copyAll}
                  className="rounded-md border border-slate-900 bg-white px-3 py-1.5 text-xs font-medium text-slate-900 hover:bg-slate-100"
                >
                  📋 Копировать все {companies.length} писем
                </button>
              )}
              <button
                type="button"
                onClick={mailto}
                className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
                title="Откроет твой почтовик с готовым текстом (без адресата — вставишь сам)"
              >
                ✉ Открыть в почтовике
              </button>
              <a
                href="/app/leads/templates"
                target="_blank"
                rel="noreferrer"
                className="ml-auto text-xs text-slate-600 underline underline-offset-2 hover:text-slate-900 self-center"
              >
                Редактировать шаблоны →
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { X, Mail, Send, MessageCircle, ChevronLeft, ChevronRight, FileText, Zap } from 'lucide-react';
import {
  listTemplates,
  loadSenderProfile,
  renderProposal,
  type LeadValues,
  type ProposalChannel,
  type ProposalTemplate,
} from '@/lib/proposalTemplates';

interface ProposalSendModalProps {
  open: boolean;
  onClose: () => void;
  leads: LeadValues[];
  /** Optional callback for "Send" — for now the modal just shows a toast in
   *  the parent. Real wiring lands when the backend campaign API is ready. */
  onConfirm?: (templateId: string) => void;
}

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

export function ProposalSendModal({ open, onClose, leads, onConfirm }: ProposalSendModalProps) {
  const [templates, setTemplates] = useState<ProposalTemplate[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [previewIdx, setPreviewIdx] = useState(0);

  // Re-read templates from localStorage every time the modal opens so the
  // user sees freshly-saved ones without a hard reload.
  useEffect(() => {
    if (!open) return;
    const list = listTemplates();
    setTemplates(list);
    setSelectedId((prev) => prev ?? list[0]?.id ?? null);
    setPreviewIdx(0);
  }, [open]);

  // Esc to close — keeps the modal feeling native.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const selected = useMemo(
    () => templates.find((t) => t.id === selectedId) ?? null,
    [templates, selectedId],
  );

  const sender = useMemo(() => loadSenderProfile(), [open]);

  const safeIdx = Math.max(0, Math.min(previewIdx, leads.length - 1));
  const previewLead = leads[safeIdx];

  const rendered = useMemo(() => {
    if (!selected || !previewLead) return null;
    return renderProposal(selected, previewLead, sender);
  }, [selected, previewLead, sender]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Отправка КП"
      className="fixed inset-0 z-[10000] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="w-full max-w-[1100px] max-h-[90vh] flex flex-col"
        style={{
          background: 'hsl(var(--surface))',
          border: '1px solid hsl(var(--border))',
          borderRadius: 8,
          boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4 shrink-0"
          style={{ borderBottom: '1px solid hsl(var(--border))' }}
        >
          <div>
            <div className="text-[16px] font-bold" style={{ color: 'hsl(var(--text))' }}>
              Отправка КП по {leads.length} {leads.length === 1 ? 'лиду' : 'лидам'}
            </div>
            <div className="app-mono-label mt-0.5" style={{ color: 'hsl(var(--muted))' }}>
              выберите шаблон → проверьте превью → отправьте
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center justify-center w-9 h-9 transition-colors hover:bg-[hsl(var(--surface-2))]"
            style={{ color: 'hsl(var(--muted))', borderRadius: 4 }}
            aria-label="Закрыть"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        {templates.length === 0 ? (
          <div className="flex-1 flex items-center justify-center p-8">
            <div className="text-center max-w-[420px]">
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
                Шаблонов пока нет
              </h3>
              <p className="text-[13px] mb-5" style={{ color: 'hsl(var(--muted))' }}>
                Создайте первый шаблон — потом сможете отправлять его по выбранным лидам с
                автоматической подстановкой имени компании и контакта.
              </p>
              <Link
                href="/app/leads/proposals/new"
                className="app-cta-mega inline-flex"
                style={{ height: 40, padding: '0 18px', fontSize: 13 }}
                onClick={onClose}
              >
                Создать шаблон
              </Link>
            </div>
          </div>
        ) : (
          <div className="grid md:grid-cols-[280px_1fr] flex-1 overflow-hidden">
            {/* Templates list */}
            <div
              className="overflow-y-auto p-3"
              style={{ borderRight: '1px solid hsl(var(--border))', background: 'hsl(var(--surface-2) / 0.3)' }}
            >
              <div className="app-mono-label mb-2 px-1" style={{ color: 'hsl(var(--muted))' }}>
                {templates.length} шаблон{templates.length === 1 ? '' : templates.length < 5 ? 'а' : 'ов'}
              </div>
              <div className="space-y-1">
                {templates.map((t) => {
                  const active = t.id === selectedId;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setSelectedId(t.id)}
                      className="w-full text-left p-3 transition-colors"
                      style={{
                        background: active ? 'hsl(var(--accent-weak))' : 'hsl(var(--surface))',
                        border: `1px solid ${active ? 'hsl(var(--accent) / 0.5)' : 'hsl(var(--border))'}`,
                        borderRadius: 4,
                      }}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span
                          className="inline-flex items-center gap-1 px-1.5 h-5 app-mono-label"
                          style={{
                            background: 'hsl(var(--surface))',
                            color: 'hsl(var(--accent))',
                            border: '1px solid hsl(var(--accent) / 0.3)',
                            borderRadius: 3,
                            fontSize: 10,
                          }}
                        >
                          {CHANNEL_ICON[t.channel]} {CHANNEL_LABEL[t.channel]}
                        </span>
                      </div>
                      <div
                        className="text-[13px] font-semibold truncate"
                        style={{ color: 'hsl(var(--text))' }}
                      >
                        {t.name || '(без имени)'}
                      </div>
                    </button>
                  );
                })}
              </div>

              <Link
                href="/app/leads/proposals/new"
                onClick={onClose}
                className="mt-3 inline-flex items-center justify-center gap-1 w-full h-9 text-[12px] font-semibold transition-colors hover:bg-[hsl(var(--accent-weak))]"
                style={{
                  color: 'hsl(var(--accent))',
                  border: '1px dashed hsl(var(--accent) / 0.4)',
                  borderRadius: 4,
                }}
              >
                + Новый шаблон
              </Link>
            </div>

            {/* Preview */}
            <div className="overflow-y-auto p-5">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <div className="app-mono-label" style={{ color: 'hsl(var(--muted))' }}>
                    превью на лиде
                  </div>
                  {previewLead && (
                    <div className="text-[14px] font-semibold mt-1" style={{ color: 'hsl(var(--text))' }}>
                      {previewLead.company || previewLead.domain || '—'}
                    </div>
                  )}
                </div>
                {leads.length > 1 && (
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      disabled={safeIdx === 0}
                      onClick={() => setPreviewIdx((i) => Math.max(0, i - 1))}
                      className="inline-flex items-center justify-center w-8 h-8 transition-colors disabled:opacity-40 hover:bg-[hsl(var(--accent-weak))]"
                      style={{ color: 'hsl(var(--muted))', borderRadius: 3 }}
                      aria-label="Предыдущий лид"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                    <span className="app-mono-label px-2" style={{ color: 'hsl(var(--muted))' }}>
                      {safeIdx + 1} / {leads.length}
                    </span>
                    <button
                      type="button"
                      disabled={safeIdx >= leads.length - 1}
                      onClick={() => setPreviewIdx((i) => Math.min(leads.length - 1, i + 1))}
                      className="inline-flex items-center justify-center w-8 h-8 transition-colors disabled:opacity-40 hover:bg-[hsl(var(--accent-weak))]"
                      style={{ color: 'hsl(var(--muted))', borderRadius: 3 }}
                      aria-label="Следующий лид"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </div>

              <div
                className="p-5 leading-relaxed text-[14px]"
                style={{
                  background: 'hsl(var(--surface-2) / 0.4)',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: 6,
                  whiteSpace: 'pre-wrap',
                  color: 'hsl(var(--text))',
                  minHeight: 240,
                }}
              >
                {!rendered ? (
                  <span style={{ color: 'hsl(var(--muted))' }}>—</span>
                ) : (
                  <>
                    {selected?.channel === 'email' && (
                      <div
                        className="mb-4 pb-3"
                        style={{ borderBottom: '1px dashed hsl(var(--border))' }}
                      >
                        <div className="app-mono-label" style={{ color: 'hsl(var(--muted))' }}>
                          тема
                        </div>
                        <div className="text-[15px] font-semibold mt-1">{rendered.subject || '—'}</div>
                      </div>
                    )}
                    <div>{rendered.body || <span style={{ color: 'hsl(var(--muted))' }}>—</span>}</div>
                    {rendered.signature && (
                      <div
                        className="mt-5 pt-3 text-[13px]"
                        style={{
                          color: 'hsl(var(--muted))',
                          borderTop: '1px dashed hsl(var(--border))',
                        }}
                      >
                        {rendered.signature}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div
          className="flex items-center justify-between gap-3 px-5 py-4 shrink-0"
          style={{ borderTop: '1px solid hsl(var(--border))' }}
        >
          <div className="app-mono-label" style={{ color: 'hsl(var(--muted))' }}>
            {selected
              ? `Канал: ${CHANNEL_LABEL[selected.channel]} · отправок: ${leads.length}`
              : 'выберите шаблон'}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="h-10 px-4 text-[13px] font-semibold transition-colors hover:bg-[hsl(var(--surface-2))]"
              style={{
                color: 'hsl(var(--muted))',
                border: '1px solid hsl(var(--border))',
                borderRadius: 4,
              }}
            >
              Отмена
            </button>
            <button
              type="button"
              disabled={!selected || leads.length === 0}
              onClick={() => {
                if (!selected) return;
                onConfirm?.(selected.id);
                onClose();
              }}
              className="app-cta-mega"
              style={{
                height: 40,
                padding: '0 18px',
                fontSize: 13,
                opacity: selected && leads.length > 0 ? 1 : 0.5,
                cursor: selected && leads.length > 0 ? 'pointer' : 'not-allowed',
              }}
            >
              <Send className="h-4 w-4" /> Отправить
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

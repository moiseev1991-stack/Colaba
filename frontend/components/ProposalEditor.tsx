'use client';

import { useMemo, useRef, useState } from 'react';
import { Mail, Send, MessageCircle, Plus, Zap, Sparkles } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import {
  PLACEHOLDERS,
  emptyTemplate,
  loadSenderProfile,
  renderProposal,
  sampleTemplate,
  saveSenderProfile,
  type ProposalChannel,
  type ProposalTemplate,
  type SenderProfile,
} from '@/lib/proposalTemplates';

interface ProposalEditorProps {
  initial?: ProposalTemplate;
  onSave: (tpl: Omit<ProposalTemplate, 'createdAt' | 'updatedAt'>) => void;
  onCancel: () => void;
}

const CHANNEL_META: Record<ProposalChannel, { label: string; icon: React.ReactNode; hint: string }> = {
  email: { label: 'Email', icon: <Mail className="h-3.5 w-3.5" />, hint: 'обычное письмо в почту' },
  telegram: {
    label: 'Telegram',
    icon: <Send className="h-3.5 w-3.5" />,
    hint: 'без темы — только тело сообщения',
  },
  whatsapp: {
    label: 'WhatsApp',
    icon: <MessageCircle className="h-3.5 w-3.5" />,
    hint: 'без темы — только тело сообщения',
  },
  max: {
    label: 'MAX',
    icon: <Zap className="h-3.5 w-3.5" />,
    hint: 'без темы — только тело сообщения',
  },
};

// Каналы, для которых пока нет рабочей отправки на бэкенде. Кликабельный
// только Email; остальные подсвечены полупрозрачными с бейджем «скоро».
const DISABLED_CHANNELS: ReadonlySet<ProposalChannel> = new Set([
  'telegram',
  'whatsapp',
  'max',
]);

// Поля профиля отправителя в порядке, в котором они появляются в форме.
// Каждое поле имеет читаемый лейбл (выводится над input'ом), имя переменной
// (показывается мелко справа в лейбле — тот самый `{my_*}` токен, который
// пользователь увидит в шаблоне), и пример-плейсхолдер внутри input'а.
const SENDER_FIELDS: ReadonlyArray<{
  key: keyof SenderProfile;
  varName: string;
  label: string;
  example: string;
  fullWidth?: boolean;
}> = [
  { key: 'myName', varName: 'my_name', label: 'Ваше имя', example: 'Дмитрий Моисеев' },
  { key: 'myCompany', varName: 'my_company', label: 'Ваша компания', example: 'Colaba' },
  { key: 'myOffer', varName: 'my_offer', label: 'Ваша услуга', example: 'разработка сайта под ключ' },
  { key: 'myPhone', varName: 'my_phone', label: 'Ваш телефон', example: '+7 999 123-45-67' },
  { key: 'myLink', varName: 'my_link', label: 'Ваш сайт', example: 'colaba.ru', fullWidth: true },
];

// Sample lead used in the live preview. Real values get filled in from the
// actual `LeadRow` when the user opens the send-modal from the results table.
const SAMPLE_LEAD = {
  company: 'Стоматология Плюс',
  domain: 'stomplus.ru',
  city: 'Москва',
  contact: 'info@stomplus.ru',
  searchQuery: 'стоматология Москва',
};

export function ProposalEditor({ initial, onSave, onCancel }: ProposalEditorProps) {
  const seed = initial ?? emptyTemplate('email');
  const [name, setName] = useState(seed.name);
  const [channel, setChannel] = useState<ProposalChannel>(seed.channel);
  const [subject, setSubject] = useState(seed.subject);
  const [body, setBody] = useState(seed.body);
  const [signature, setSignature] = useState(seed.signature);
  const [sender, setSender] = useState<SenderProfile>(() => loadSenderProfile());

  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const subjectRef = useRef<HTMLInputElement>(null);
  const signatureRef = useRef<HTMLTextAreaElement>(null);
  // Tracks which field most recently had focus, so the placeholder chip
  // inserts into the right place even after the click moves focus to the chip.
  const [focusTarget, setFocusTarget] = useState<'subject' | 'body' | 'signature'>('body');

  const insertPlaceholder = (key: string) => {
    const token = `{${key}}`;
    const apply = (
      el: HTMLInputElement | HTMLTextAreaElement | null,
      value: string,
      setter: (v: string) => void,
    ) => {
      if (!el) {
        setter(value + token);
        return;
      }
      const start = el.selectionStart ?? value.length;
      const end = el.selectionEnd ?? value.length;
      const next = value.slice(0, start) + token + value.slice(end);
      setter(next);
      // Re-focus and put the cursor right after the just-inserted token so
      // the user can keep typing in flow.
      requestAnimationFrame(() => {
        el.focus();
        const cursor = start + token.length;
        try {
          el.setSelectionRange(cursor, cursor);
        } catch {
          // setSelectionRange isn't supported on all input types — ignore.
        }
      });
    };
    if (focusTarget === 'subject') apply(subjectRef.current, subject, setSubject);
    else if (focusTarget === 'signature') apply(signatureRef.current, signature, setSignature);
    else apply(bodyRef.current, body, setBody);
  };

  const handleSenderChange = (patch: Partial<SenderProfile>) => {
    const next = { ...sender, ...patch };
    setSender(next);
    saveSenderProfile(next);
  };

  // Loads the showcase template so a first-time user can see what a working
  // proposal actually looks like instead of staring at a half-empty editor.
  // Confirms before overwriting non-empty fields so we don't nuke their work.
  const handleLoadSample = () => {
    const hasContent = name.trim() || body.trim().length > 10 || subject.trim();
    if (hasContent && !confirm('Загрузить пример? Текущий текст шаблона будет заменён.')) {
      return;
    }
    const sample = sampleTemplate(channel === 'email' ? 'email' : 'email');
    setName(sample.name);
    setSubject(sample.subject);
    setBody(sample.body);
    setSignature(sample.signature);
    setChannel('email');
  };

  const preview = useMemo(() => {
    const tpl: ProposalTemplate = {
      id: seed.id,
      name,
      channel,
      subject,
      body,
      signature,
      createdAt: seed.createdAt,
      updatedAt: Date.now(),
    };
    return renderProposal(tpl, SAMPLE_LEAD, sender);
  }, [seed.id, seed.createdAt, name, channel, subject, body, signature, sender]);

  const isValid = name.trim().length >= 2 && body.trim().length >= 10;

  const handleSave = () => {
    if (!isValid) return;
    onSave({
      id: seed.id,
      name: name.trim(),
      channel,
      subject: channel === 'email' ? subject : '',
      body,
      signature,
    });
  };

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* === LEFT: editor === */}
      <div className="grid gap-4">
        {/* Загрузить пример — превращает пустой редактор в живой шаблон, чтобы
            новый пользователь сразу видел, как это работает на реальном лиде. */}
        <button
          type="button"
          onClick={handleLoadSample}
          className="inline-flex items-center justify-center gap-2 h-10 px-4 text-[13px] font-semibold transition-all hover:bg-[hsl(var(--accent-weak))]"
          style={{
            background: 'hsl(var(--surface-2) / 0.5)',
            color: 'hsl(var(--accent))',
            border: '1px dashed hsl(var(--accent) / 0.5)',
            borderRadius: 4,
          }}
          title="Заполнить редактор готовым работающим шаблоном — потом отредактируете под себя"
        >
          <Sparkles className="h-4 w-4" />
          Загрузить пример шаблона
        </button>

        <div>
          <label className="block app-mono-label mb-1.5" style={{ color: 'hsl(var(--muted))' }}>
            название шаблона
          </label>
          <Input
            type="text"
            placeholder="Например: Холодное КП — веб-разработка"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full h-10 text-[14px]"
          />
        </div>

        <div>
          <label className="block app-mono-label mb-1.5" style={{ color: 'hsl(var(--muted))' }}>
            канал отправки
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {(Object.keys(CHANNEL_META) as ProposalChannel[]).map((c) => {
              const meta = CHANNEL_META[c];
              const active = channel === c;
              const disabled = DISABLED_CHANNELS.has(c);
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() => {
                    if (disabled) return;
                    setChannel(c);
                  }}
                  aria-disabled={disabled}
                  title={disabled ? 'Канал скоро будет доступен' : undefined}
                  className="relative flex flex-col items-start gap-1 p-3 text-left transition-all"
                  style={{
                    background: active ? 'hsl(var(--accent-weak))' : 'hsl(var(--surface))',
                    border: `1px solid ${active ? 'hsl(var(--accent) / 0.5)' : 'hsl(var(--border))'}`,
                    borderRadius: 4,
                    color: active ? 'hsl(var(--accent))' : 'hsl(var(--text))',
                    opacity: disabled ? 0.5 : 1,
                    cursor: disabled ? 'not-allowed' : 'pointer',
                  }}
                >
                  {disabled && (
                    <span
                      className="absolute top-1.5 right-1.5 inline-flex items-center px-1.5 h-4 app-mono-label"
                      style={{
                        background: 'hsl(var(--surface-2))',
                        color: 'hsl(var(--muted))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: 2,
                        fontSize: 9,
                        letterSpacing: '0.06em',
                      }}
                    >
                      скоро
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold">
                    {meta.icon} {meta.label}
                  </span>
                  <span className="text-[11px]" style={{ color: 'hsl(var(--muted))' }}>
                    {meta.hint}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {channel === 'email' && (
          <div>
            <label className="block app-mono-label mb-1.5" style={{ color: 'hsl(var(--muted))' }}>
              тема письма
            </label>
            <Input
              ref={subjectRef}
              type="text"
              placeholder="Для {company} — {my_offer}"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              onFocus={() => setFocusTarget('subject')}
              className="w-full h-10 text-[14px]"
            />
          </div>
        )}

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="app-mono-label" style={{ color: 'hsl(var(--muted))' }}>
              тело сообщения
            </label>
            <span className="app-mono-label" style={{ color: 'hsl(var(--muted))' }}>
              {body.length} симв.
            </span>
          </div>
          <textarea
            ref={bodyRef}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onFocus={() => setFocusTarget('body')}
            rows={10}
            placeholder="Здравствуйте, {company}! ..."
            className="w-full p-3 text-[14px] outline-none resize-y leading-relaxed"
            style={{
              background: 'hsl(var(--surface))',
              border: '1px solid hsl(var(--border))',
              borderRadius: 4,
              color: 'hsl(var(--text))',
              fontFamily: 'inherit',
            }}
          />
        </div>

        <div>
          <label className="block app-mono-label mb-1.5" style={{ color: 'hsl(var(--muted))' }}>
            подпись
          </label>
          <textarea
            ref={signatureRef}
            value={signature}
            onChange={(e) => setSignature(e.target.value)}
            onFocus={() => setFocusTarget('signature')}
            rows={3}
            placeholder="—&#10;{my_name}, {my_company}&#10;{my_phone} · {my_link}"
            className="w-full p-3 text-[13px] outline-none resize-y leading-relaxed"
            style={{
              background: 'hsl(var(--surface))',
              border: '1px solid hsl(var(--border))',
              borderRadius: 4,
              color: 'hsl(var(--text))',
              fontFamily: 'inherit',
            }}
          />
        </div>

        {/* Placeholder palette — grouped into «О лиде» (auto-filled by Colaba
            when sending) and «О вас» (from the sender profile below). Each
            chip shows the human label up top and the actual `{token}` mono
            below, so the user understands both what it means and what to
            paste in the editor. */}
        <div
          className="p-3"
          style={{
            background: 'hsl(var(--surface-2) / 0.5)',
            border: '1px solid hsl(var(--border))',
            borderRadius: 4,
          }}
        >
          <div className="app-mono-label mb-3" style={{ color: 'hsl(var(--muted))' }}>
            переменные — кликните чтобы вставить в{' '}
            <span style={{ color: 'hsl(var(--accent))', fontWeight: 600 }}>
              {focusTarget === 'subject' ? 'тему' : focusTarget === 'signature' ? 'подпись' : 'тело'}
            </span>
          </div>

          {(['lead', 'sender'] as const).map((groupKey) => {
            const items = PLACEHOLDERS.filter((p) => p.group === groupKey);
            const groupTitle = groupKey === 'lead' ? 'О лиде' : 'О вас';
            const groupHint =
              groupKey === 'lead'
                ? 'подставится автоматически из найденной компании'
                : 'из вашего профиля ниже';
            return (
              <div key={groupKey} className={groupKey === 'sender' ? 'mt-3' : undefined}>
                <div
                  className="flex items-center gap-2 mb-1.5"
                  style={{ color: 'hsl(var(--muted))' }}
                >
                  <span className="app-mono-label" style={{ color: 'hsl(var(--accent))' }}>
                    {groupTitle}
                  </span>
                  <span className="text-[11px]">— {groupHint}</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {items.map((p) => (
                    <button
                      key={p.key}
                      type="button"
                      onClick={() => insertPlaceholder(p.key)}
                      title={`${p.label} · ${p.hint} · пример: ${p.example}`}
                      className="inline-flex flex-col items-start gap-0.5 px-2.5 py-1.5 transition-colors hover:bg-[hsl(var(--accent-weak))]"
                      style={{
                        background: 'hsl(var(--surface))',
                        color: 'hsl(var(--accent))',
                        border: '1px solid hsl(var(--accent) / 0.3)',
                        borderRadius: 3,
                        minHeight: 36,
                      }}
                    >
                      <span
                        className="inline-flex items-center gap-1 text-[12px] font-semibold"
                        style={{ color: 'hsl(var(--text))' }}
                      >
                        <Plus className="h-3 w-3" style={{ color: 'hsl(var(--accent))' }} />
                        {p.label}
                      </span>
                      <span
                        className="font-mono"
                        style={{
                          fontSize: 10,
                          color: 'hsl(var(--accent) / 0.75)',
                          paddingLeft: 14,
                        }}
                      >
                        {`{${p.key}}`}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {/* Sender profile — saved separately so it survives across templates */}
        <div
          className="p-3"
          style={{
            background: 'hsl(var(--surface-2) / 0.3)',
            border: '1px dashed hsl(var(--border))',
            borderRadius: 4,
          }}
        >
          <div className="app-mono-label mb-3" style={{ color: 'hsl(var(--muted))' }}>
            ваш профиль (подставляется в {`{my_*}`} переменные)
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {SENDER_FIELDS.map((f) => (
              <div key={f.key} className={f.fullWidth ? 'sm:col-span-2' : undefined}>
                <label
                  className="flex items-center justify-between app-mono-label mb-1"
                  style={{ color: 'hsl(var(--muted))' }}
                >
                  <span>{f.label}</span>
                  <span
                    className="font-mono"
                    style={{
                      color: 'hsl(var(--accent) / 0.75)',
                      fontSize: 10,
                      letterSpacing: 0,
                      textTransform: 'none',
                    }}
                  >
                    {`{${f.varName}}`}
                  </span>
                </label>
                <Input
                  type="text"
                  placeholder={f.example}
                  value={sender[f.key]}
                  onChange={(e) => handleSenderChange({ [f.key]: e.target.value })}
                  className="h-9 text-[13px]"
                />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* === RIGHT: live preview === */}
      <div>
        <div className="flex items-center gap-3 mb-3 sticky top-0 z-10" style={{ paddingTop: 0 }}>
          <span className="app-mono-label" style={{ color: 'hsl(var(--muted))' }}>
            превью на тестовом лиде
          </span>
          <span
            className="inline-flex items-center gap-1 app-mono-label px-2 h-6"
            style={{
              background: 'hsl(var(--accent-weak))',
              color: 'hsl(var(--accent))',
              border: '1px solid hsl(var(--accent) / 0.3)',
              borderRadius: 3,
            }}
            title="Этим текстом заменены плейсхолдеры в превью"
          >
            {SAMPLE_LEAD.company}
          </span>
        </div>

        <div
          className="p-5 leading-relaxed text-[14px]"
          style={{
            background: 'hsl(var(--surface))',
            border: '1px solid hsl(var(--border))',
            borderRadius: 6,
            minHeight: 320,
            whiteSpace: 'pre-wrap',
            color: 'hsl(var(--text))',
          }}
        >
          {channel === 'email' && (
            <div
              className="mb-4 pb-3"
              style={{ borderBottom: '1px dashed hsl(var(--border))' }}
            >
              <div className="app-mono-label" style={{ color: 'hsl(var(--muted))' }}>
                тема
              </div>
              <div className="text-[15px] font-semibold mt-1" style={{ color: 'hsl(var(--text))' }}>
                {preview.subject || <span style={{ color: 'hsl(var(--muted))' }}>—</span>}
              </div>
            </div>
          )}
          <div>{preview.body || <span style={{ color: 'hsl(var(--muted))' }}>—</span>}</div>
          {preview.signature && (
            <div
              className="mt-5 pt-3 text-[13px]"
              style={{
                color: 'hsl(var(--muted))',
                borderTop: '1px dashed hsl(var(--border))',
              }}
            >
              {preview.signature}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 mt-4">
          <button
            type="button"
            onClick={onCancel}
            className="h-10 px-4 text-[13px] font-semibold transition-colors hover:bg-[hsl(var(--surface-2))]"
            style={{
              background: 'transparent',
              color: 'hsl(var(--muted))',
              border: '1px solid hsl(var(--border))',
              borderRadius: 4,
            }}
          >
            Отмена
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!isValid}
            className="app-cta-mega"
            style={{
              height: 40,
              padding: '0 18px',
              fontSize: 13,
              opacity: isValid ? 1 : 0.5,
              cursor: isValid ? 'pointer' : 'not-allowed',
            }}
          >
            Сохранить шаблон
          </button>
        </div>
      </div>
    </div>
  );
}

// Re-exported here so consumers can do `import { Select } from '@/components/ProposalEditor'`
// if they need the same picker styling — keeps the import surface tidy.
export { Select };

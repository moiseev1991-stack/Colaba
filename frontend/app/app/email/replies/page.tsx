'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Inbox } from 'lucide-react';
import { getReplies, type EmailReply } from '@/src/services/api/emailReplies';
import { EmptyState } from '@/components/EmptyState';

// Демо-ответы для empty-state. Показываются только пока нет ни одного
// реального ответа — чтобы юзер сразу понимал, что эта страница покажет:
// типичный спектр реакций на холодную рассылку (интерес / уточнение /
// отказ / авто-ответ). Чисто фронтовый mock, ID отрицательные —
// в реальные данные не лезут.
const SAMPLE_REPLIES: Array<EmailReply & { _category: string; _categoryColor: string }> = [
  {
    id: -1,
    from_email: 'a.petrov@stomplus.ru',
    from_name: 'Алексей Петров',
    subject: 'Re: Для ООО Стоматология Плюс — продвижение в Яндексе',
    body_text:
      'Здравствуйте, Дмитрий! Спасибо за письмо, тема актуальная — у нас как раз просели позиции. Можно созвониться завтра в 14:00? Мой телефон: +7 916 123-45-67.',
    campaign_id: -1,
    is_processed: false,
    forwarded_to: null,
    received_at: new Date(Date.now() - 1000 * 60 * 28).toISOString(),
    _category: 'Интерес',
    _categoryColor: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/40',
  },
  {
    id: -2,
    from_email: 'info@bplaw.ru',
    from_name: 'Баранча и Партнёры',
    subject: 'Re: Для Баранча и Партнёры — продвижение в Яндексе',
    body_text:
      'Добрый день. Уточните, пожалуйста, стоимость работ за месяц и срок выхода в топ-10. Что входит в гарантию?',
    campaign_id: -1,
    is_processed: false,
    forwarded_to: null,
    received_at: new Date(Date.now() - 1000 * 60 * 60 * 3).toISOString(),
    _category: 'Уточнение',
    _categoryColor: 'bg-sky-500/15 text-sky-600 dark:text-sky-400 border-sky-500/40',
  },
  {
    id: -3,
    from_email: 'office@logosinfo.ru',
    from_name: null,
    subject: 'Re: Юридические услуги СПб — повторное касание',
    body_text:
      'Спасибо, не актуально. Уже работаем с подрядчиком. Просьба больше не писать.',
    campaign_id: -2,
    is_processed: true,
    forwarded_to: null,
    received_at: new Date(Date.now() - 1000 * 60 * 60 * 6).toISOString(),
    _category: 'Отказ',
    _categoryColor: 'bg-zinc-500/15 text-zinc-600 dark:text-zinc-300 border-zinc-500/40',
  },
  {
    id: -4,
    from_email: 'mail@adveconspb.ru',
    from_name: 'Мария Соколова',
    subject: 'Автоответ: я в отпуске до 15.05',
    body_text:
      'Здравствуйте! Я в отпуске до 15 мая, отвечу по возвращении. По срочным вопросам обращайтесь к Ивану: i.fedorov@adveconspb.ru.',
    campaign_id: -2,
    is_processed: false,
    forwarded_to: null,
    received_at: new Date(Date.now() - 1000 * 60 * 60 * 22).toISOString(),
    _category: 'Авто-ответ',
    _categoryColor: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/40',
  },
];

function formatRelativeRu(iso: string): string {
  const diffMin = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (diffMin < 1) return 'только что';
  if (diffMin < 60) return `${diffMin} мин назад`;
  const diffH = Math.round(diffMin / 60);
  if (diffH < 24) return `${diffH} ч назад`;
  const diffD = Math.round(diffH / 24);
  return `${diffD} дн назад`;
}

export default function EmailRepliesPage() {
  const [replies, setReplies] = useState<EmailReply[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadReplies();
  }, []);

  const loadReplies = async () => {
    try {
      setLoading(true);
      const data = await getReplies({ limit: 100 });
      setReplies(data.replies || []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка загрузки');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg">Загрузка...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-red-600">{error}</div>
      </div>
    );
  }

  // Стили, общие для обеих секций — вынесено в локальные константы, чтобы
  // не дублировать style-объекты в JSX и легко править в одном месте.
  const surfaceStyle = {
    background: 'hsl(var(--surface))',
    border: '1px solid hsl(var(--border))',
  } as const;
  const headRowStyle = { background: 'hsl(var(--surface-2))' } as const;
  const thStyle = { color: 'hsl(var(--muted))' } as const;
  const rowDivider = { borderBottom: '1px solid hsl(var(--border))' } as const;
  const textPrimary = { color: 'hsl(var(--text))' } as const;
  const textMuted = { color: 'hsl(var(--muted))' } as const;

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold" style={textPrimary}>Входящие ответы</h1>
        <p className="mt-1" style={textMuted}>Ответы на ваши коммерческие предложения</p>
      </div>

      {replies.length === 0 ? (
        <EmptyState
          icon={<Inbox className="h-6 w-6" />}
          title="У вас пока нет входящих ответов"
          description={
            <>
              Ответы будут приходить сюда автоматически — Colaba читает их через
              IMAP catch-all-адрес, который вы настроили в Email-настройках.
            </>
          }
          demoNote="демо-данные — не ваши ответы. Так выглядят 4 типичные реакции на холодное письмо."
          demo={
            <table className="min-w-full">
              <thead>
                <tr style={headRowStyle}>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase" style={thStyle}>От кого</th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase" style={thStyle}>Тема и превью ответа</th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase" style={thStyle}>Категория</th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase" style={thStyle}>Получен</th>
                </tr>
              </thead>
              <tbody>
                {SAMPLE_REPLIES.map((reply, idx) => (
                  <tr key={reply.id} style={idx < SAMPLE_REPLIES.length - 1 ? rowDivider : undefined}>
                    <td className="px-6 py-4 whitespace-nowrap align-top">
                      <div className="text-sm font-medium" style={textPrimary}>
                        {reply.from_name || reply.from_email}
                      </div>
                      {reply.from_name && (
                        <div className="text-xs" style={textMuted}>{reply.from_email}</div>
                      )}
                    </td>
                    <td className="px-6 py-4 max-w-md align-top">
                      <div className="text-sm font-medium mb-1" style={textPrimary}>
                        {reply.subject}
                      </div>
                      <div className="text-xs line-clamp-2" style={textMuted}>
                        {reply.body_text}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap align-top">
                      <span className={`px-2 py-0.5 inline-flex text-xs leading-5 font-semibold rounded border ${reply._categoryColor}`}>
                        {reply._category}
                      </span>
                      {reply.is_processed && (
                        <div className="text-[10px] mt-1" style={textMuted}>обработан</div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm align-top" style={textMuted}>
                      {formatRelativeRu(reply.received_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          }
        />
      ) : (
        <div className="rounded-lg overflow-hidden" style={surfaceStyle}>
          <table className="min-w-full">
            <thead>
              <tr style={headRowStyle}>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase" style={thStyle}>От кого</th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase" style={thStyle}>Тема</th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase" style={thStyle}>Статус</th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase" style={thStyle}>Получен</th>
              </tr>
            </thead>
            <tbody>
              {replies.map((reply, idx) => (
                <tr key={reply.id} style={idx < replies.length - 1 ? rowDivider : undefined}>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium" style={textPrimary}>
                      {reply.from_name || reply.from_email}
                    </div>
                    {reply.from_name && (
                      <div className="text-sm" style={textMuted}>{reply.from_email}</div>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm max-w-xs truncate" style={textPrimary}>
                      {reply.subject}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 py-0.5 inline-flex text-xs leading-5 font-semibold rounded-full border ${
                      reply.is_processed
                        ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/40'
                        : 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/40'
                    }`}>
                      {reply.is_processed ? 'Обработан' : 'Новый'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm" style={textMuted}>
                    {new Date(reply.received_at).toLocaleDateString('ru-RU')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-6">
        <Link href="/app/email" className="text-sm hover:underline" style={{ color: 'hsl(var(--accent))' }}>
          ← Назад к Email
        </Link>
      </div>
    </div>
  );
}

'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Loader2, Send, Archive, Mail, ArrowLeft } from 'lucide-react';
import {
  getThreads,
  getThread,
  sendThreadMessage,
  markThreadRead,
  archiveThread,
  type ThreadListItem,
  type ThreadDetail,
} from '@/src/services/api/emailThreads';

function formatRelativeRu(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  const diffMin = Math.round((Date.now() - d.getTime()) / 60000);
  if (diffMin < 1) return 'только что';
  if (diffMin < 60) return `${diffMin} мин`;
  const diffH = Math.round(diffMin / 60);
  if (diffH < 24) return `${diffH} ч`;
  const diffD = Math.round(diffH / 24);
  return `${diffD} дн`;
}

function formatTimeRu(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function EmailMessagesPage() {
  const [threads, setThreads] = useState<ThreadListItem[]>([]);
  const [activeThread, setActiveThread] = useState<ThreadDetail | null>(null);
  const [activeThreadId, setActiveThreadId] = useState<number | null>(null);
  const [loadingThreads, setLoadingThreads] = useState(true);
  const [loadingThread, setLoadingThread] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const loadThreads = useCallback(async () => {
    try {
      const data = await getThreads({ limit: 100 });
      setThreads(data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка загрузки');
    } finally {
      setLoadingThreads(false);
    }
  }, []);

  useEffect(() => {
    loadThreads();
  }, [loadThreads]);

  // Polling: обновляем список каждые 10 сек (для новых ответов).
  useEffect(() => {
    const interval = setInterval(loadThreads, 10000);
    return () => clearInterval(interval);
  }, [loadThreads]);

  const selectThread = useCallback(async (id: number) => {
    setActiveThreadId(id);
    setLoadingThread(true);
    try {
      const detail = await getThread(id);
      setActiveThread(detail);
      // Отмечаем прочитанным.
      await markThreadRead(id);
      // Обновляем счётчик в списке.
      setThreads((prev) => prev.map((t) => (t.id === id ? { ...t, unread_count: 0 } : t)));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка загрузки треда');
    } finally {
      setLoadingThread(false);
    }
  }, []);

  // Прокрутка к последнему сообщению при загрузке/новом сообщении.
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeThread?.messages.length]);

  const handleSend = async () => {
    if (!activeThreadId || !replyText.trim()) return;
    setSending(true);
    try {
      const msg = await sendThreadMessage(activeThreadId, replyText.trim());
      // Добавляем сообщение в тред локально.
      setActiveThread((prev) => (prev ? { ...prev, messages: [...prev.messages, msg] } : prev));
      setReplyText('');
      // Обновляем превью в списке тредов.
      setThreads((prev) =>
        prev.map((t) =>
          t.id === activeThreadId
            ? {
                ...t,
                last_message_at: msg.timestamp,
                last_message_preview: replyText.trim().slice(0, 100),
                last_message_direction: 'outgoing',
              }
            : t,
        ),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка отправки');
    } finally {
      setSending(false);
    }
  };

  const handleArchive = async () => {
    if (!activeThreadId) return;
    try {
      await archiveThread(activeThreadId);
      setThreads((prev) => prev.filter((t) => t.id !== activeThreadId));
      setActiveThread(null);
      setActiveThreadId(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка архивации');
    }
  };

  // Enter для отправки, Shift+Enter для переноса.
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const textPrimary = { color: 'hsl(var(--text))' };
  const textMuted = { color: 'hsl(var(--muted))' };

  if (loadingThreads) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-6 w-6 animate-spin" style={textMuted} />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)]">
      {/* Header */}
      <div className="border-b px-6 py-4" style={{ borderColor: 'hsl(var(--border))' }}>
        <h1 className="text-xl font-bold" style={textPrimary}>
          Сообщения
        </h1>
        <p className="text-sm mt-0.5" style={textMuted}>
          Переписка с клиентами — ответы на ваши КП
        </p>
      </div>

      {error && (
        <div
          className="mx-6 mt-3 px-4 py-2 rounded text-sm"
          style={{
            background: 'var(--signal-hot-bg)',
            color: 'var(--signal-hot)',
          }}
        >
          {error}
          <button className="ml-3 underline" onClick={() => setError(null)}>
            закрыть
          </button>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        {/* Левая колонка: список тредов */}
        <div
          className="w-full md:w-[340px] border-r overflow-y-auto flex-shrink-0"
          style={{
            borderColor: 'hsl(var(--border))',
            background: 'hsl(var(--surface))',
            display: activeThreadId ? 'none' : 'block',
          }}
        >
          {threads.length === 0 ? (
            <div className="p-8 text-center" style={textMuted}>
              <Mail className="h-8 w-8 mx-auto mb-3 opacity-40" />
              <p className="text-sm">
                Пока нет переписки. Ответы клиентов на ваши КП появятся здесь автоматически.
              </p>
            </div>
          ) : (
            threads.map((t) => (
              <button
                key={t.id}
                onClick={() => selectThread(t.id)}
                className="w-full text-left px-4 py-3 border-b transition-colors hover:bg-[hsl(var(--surface-2))]"
                style={{
                  borderColor: 'hsl(var(--border))',
                  background: activeThreadId === t.id ? 'hsl(var(--surface-2))' : undefined,
                }}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium truncate" style={textPrimary}>
                      {t.contact_name || t.contact_email}
                    </div>
                    {t.contact_name && (
                      <div className="text-xs truncate" style={textMuted}>
                        {t.contact_email}
                      </div>
                    )}
                    <div className="text-xs mt-1 line-clamp-1" style={textMuted}>
                      {t.last_message_preview || t.subject || '—'}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1 flex-shrink-0">
                    <span className="text-[11px]" style={textMuted}>
                      {formatRelativeRu(t.last_message_at)}
                    </span>
                    {t.unread_count > 0 && (
                      <span
                        className="text-[10px] font-bold rounded-full px-1.5 py-0.5 min-w-[18px] text-center text-white"
                        style={{ background: 'var(--signal-hot)' }}
                      >
                        {t.unread_count}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            ))
          )}
        </div>

        {/* Правая колонка: переписка */}
        <div className="flex-1 flex flex-col" style={{ display: activeThreadId ? 'flex' : 'none' }}>
          {loadingThread ? (
            <div className="flex items-center justify-center flex-1">
              <Loader2 className="h-6 w-6 animate-spin" style={textMuted} />
            </div>
          ) : activeThread ? (
            <>
              {/* Header переписки */}
              <div
                className="px-4 py-3 border-b flex items-center justify-between"
                style={{ borderColor: 'hsl(var(--border))', background: 'hsl(var(--surface))' }}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <button
                    onClick={() => {
                      setActiveThreadId(null);
                      setActiveThread(null);
                    }}
                    className="md:hidden p-1 rounded hover:bg-[hsl(var(--surface-2))]"
                    style={textMuted}
                  >
                    <ArrowLeft className="h-5 w-5" />
                  </button>
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate" style={textPrimary}>
                      {activeThread.contact_name || activeThread.contact_email}
                    </div>
                    <div className="text-xs truncate" style={textMuted}>
                      {activeThread.contact_email} · {activeThread.subject}
                    </div>
                  </div>
                </div>
                <button
                  onClick={handleArchive}
                  className="p-2 rounded hover:bg-[hsl(var(--surface-2))] flex-shrink-0"
                  title="Архивировать"
                  style={textMuted}
                >
                  <Archive className="h-4 w-4" />
                </button>
              </div>

              {/* Лента сообщений */}
              <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
                {activeThread.messages.map((msg, idx) => {
                  const isOutgoing = msg.direction === 'outgoing';
                  return (
                    <div
                      key={`${msg.direction}-${msg.id}-${idx}`}
                      className={`flex ${isOutgoing ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className="max-w-[75%] rounded-2xl px-4 py-2.5"
                        style={{
                          background: isOutgoing
                            ? 'var(--signal-good-bg)'
                            : 'hsl(var(--surface-2))',
                          color: 'hsl(var(--text))',
                          border: isOutgoing
                            ? '1px solid var(--signal-good)/30'
                            : '1px solid hsl(var(--border))',
                        }}
                      >
                        {msg.subject && (
                          <div className="text-xs font-medium mb-1 opacity-70">{msg.subject}</div>
                        )}
                        <div className="text-sm whitespace-pre-wrap break-words">
                          {msg.body || '(пусто)'}
                        </div>
                        <div className="text-[10px] mt-1 opacity-60">
                          {formatTimeRu(msg.timestamp)}
                          {isOutgoing && msg.status === 'failed' && (
                            <span className="ml-2" style={{ color: 'var(--signal-hot)' }}>
                              ⚠ не отправлено
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>

              {/* Форма ответа */}
              <div
                className="border-t px-4 py-3"
                style={{ borderColor: 'hsl(var(--border))', background: 'hsl(var(--surface))' }}
              >
                <div className="flex gap-2 items-end">
                  <textarea
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Напишите ответ… (Enter — отправить, Shift+Enter — перенос)"
                    rows={2}
                    className="flex-1 resize-none rounded-lg px-3 py-2 text-sm border focus:outline-none focus:ring-1"
                    style={{
                      background: 'hsl(var(--background))',
                      borderColor: 'hsl(var(--border))',
                      color: 'hsl(var(--text))',
                    }}
                  />
                  <button
                    onClick={handleSend}
                    disabled={sending || !replyText.trim()}
                    className="rounded-lg px-4 py-2.5 text-sm font-medium text-white flex items-center gap-1.5 disabled:opacity-40"
                    style={{ background: 'var(--signal-good)' }}
                  >
                    {sending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                    Отправить
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex items-center justify-center flex-1" style={textMuted}>
              <div className="text-center">
                <Mail className="h-10 w-10 mx-auto mb-3 opacity-40" />
                <p className="text-sm">Выберите диалог слева</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

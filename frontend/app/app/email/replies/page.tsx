'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { getReplies, type EmailReply } from '@/src/services/api/emailReplies';

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

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Входящие ответы</h1>
        <p className="text-gray-600 mt-1">Ответы на ваши коммерческие предложения</p>
      </div>

      {replies.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-8 text-center">
          <div className="text-gray-500">Нет входящих ответов</div>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">От кого</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Тема</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Статус</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Получен</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {replies.map((reply) => (
                <tr key={reply.id}>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">
                      {reply.from_name || reply.from_email}
                    </div>
                    {reply.from_name && (
                      <div className="text-sm text-gray-500">{reply.from_email}</div>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm text-gray-900 max-w-xs truncate">
                      {reply.subject}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                      reply.is_processed
                        ? 'bg-green-100 text-green-800'
                        : 'bg-yellow-100 text-yellow-800'
                    }`}>
                      {reply.is_processed ? 'Обработан' : 'Новый'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {new Date(reply.received_at).toLocaleDateString('ru-RU')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-6">
        <Link href="/app/email" className="text-blue-600 hover:text-blue-800">
          ← Назад к Email
        </Link>
      </div>
    </div>
  );
}

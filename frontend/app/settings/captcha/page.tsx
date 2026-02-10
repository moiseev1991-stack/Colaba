'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ToastContainer, type Toast } from '@/components/Toast';
import { tokenStorage } from '@/client';
import { getCaptchaConfig, updateCaptchaConfig, test2Captcha, testAi } from '@/src/services/api/captcha_config';
import { listAiAssistants, type AiAssistantItem } from '@/src/services/api/ai_assistants';

function getErrorMessage(e: unknown): string {
  const err = e as { response?: { status?: number; data?: { detail?: string } } };
  const status = err?.response?.status;
  const detail = err?.response?.data?.detail;
  if (status === 401) return 'Войдите в аккаунт';
  if (status === 403) return 'Недостаточно прав';
  if (status && status >= 500) return 'Сервер недоступен';
  if (!status) return 'Сервер недоступен';
  return detail || 'Ошибка';
}

export default function CaptchaPage() {
  const [aiList, setAiList] = useState<AiAssistantItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [needsAuth, setNeedsAuth] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [form, setForm] = useState<{
    ai_assistant_id: number | null;
    '2captcha': { enabled: boolean; api_key: string };
    anticaptcha: { enabled: boolean; api_key: string };
  }>({
    ai_assistant_id: null,
    '2captcha': { enabled: false, api_key: '' },
    anticaptcha: { enabled: false, api_key: '' },
  });
  const [saving, setSaving] = useState(false);
  const [testing2, setTesting2] = useState(false);
  const [testingAi, setTestingAi] = useState(false);

  const addToast = (type: Toast['type'], message: string) => {
    setToasts((prev) => [...prev, { id: Date.now().toString(), type, message }]);
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [cfg, ais] = await Promise.all([getCaptchaConfig(), listAiAssistants()]);
      setAiList(ais.filter((a) => a.supports_vision));
      const es = cfg.external_services || {};
      const c2 = es['2captcha'] || {};
      const ac = es.anticaptcha || {};
      setForm({
        ai_assistant_id: cfg.ai_assistant_id ?? null,
        '2captcha': {
          enabled: !!c2.enabled,
          api_key: (typeof c2.api_key === 'string' ? c2.api_key : '') || '',
        },
        anticaptcha: {
          enabled: !!ac.enabled,
          api_key: (typeof ac.api_key === 'string' ? ac.api_key : '') || '',
        },
      });
    } catch (e: unknown) {
      addToast('error', getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!tokenStorage.getAccessToken()) {
      setNeedsAuth(true);
      setLoading(false);
      return;
    }
    load();
  }, [load]);

  const buildExternalServices = () => {
    const es: Record<string, { enabled: boolean; api_key?: string }> = {};
    es['2captcha'] = { enabled: form['2captcha'].enabled };
    if (form['2captcha'].api_key && form['2captcha'].api_key !== '***') es['2captcha'].api_key = form['2captcha'].api_key;
    es.anticaptcha = { enabled: form.anticaptcha.enabled };
    if (form.anticaptcha.api_key && form.anticaptcha.api_key !== '***') es.anticaptcha.api_key = form.anticaptcha.api_key;
    return es;
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateCaptchaConfig({ ai_assistant_id: form.ai_assistant_id, external_services: buildExternalServices() });
      addToast('success', 'Сохранено');
      load();
    } catch (e: unknown) {
      addToast('error', getErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const handleTest2 = async () => {
    setTesting2(true);
    try {
      const key = form['2captcha'].api_key && form['2captcha'].api_key !== '***' ? form['2captcha'].api_key : undefined;
      const r = await test2Captcha(key);
      if (r.ok) addToast('success', `2captcha: баланс ${r.balance ?? '—'}`);
      else addToast('error', r.error || 'Ошибка проверки 2captcha');
    } catch (e: unknown) {
      addToast('error', getErrorMessage(e));
    } finally {
      setTesting2(false);
    }
  };

  const handleTestAi = async () => {
    setTestingAi(true);
    try {
      const r = await testAi(form.ai_assistant_id ?? undefined);
      if (r.ok) addToast('success', `AI: ${r.reply ?? '—'}`);
      else addToast('error', r.error || 'Ошибка проверки AI');
    } catch (e: unknown) {
      addToast('error', getErrorMessage(e));
    } finally {
      setTestingAi(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 overflow-x-hidden">
      <ToastContainer toasts={toasts} onClose={(id) => setToasts((t) => t.filter((x) => x.id !== id))} />
      <PageHeader
        breadcrumb={[{ label: 'Главная', href: '/' }, { label: 'Конфигурация', href: '/settings' }, { label: 'Обход капчи' }]}
        title="Обход капчи"
      />
      {needsAuth ? (
        <div className="rounded-[14px] border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6">
          <p className="text-gray-600 dark:text-gray-400 mb-3">Войдите для доступа к настройкам.</p>
          <Link href="/auth/login" className="text-blue-600 dark:text-blue-400 hover:underline">Войти</Link>
        </div>
      ) : loading ? (
        <p className="text-gray-500 dark:text-gray-400">Загрузка…</p>
      ) : (
        <div className="space-y-6 bg-white dark:bg-gray-800 rounded-[14px] border border-gray-200 dark:border-gray-700 p-6">
          <div>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">AI-ассистент для картинок (Vision)</label>
            <select
              value={form.ai_assistant_id ?? ''}
              onChange={(e) => setForm((p) => ({ ...p, ai_assistant_id: e.target.value ? Number(e.target.value) : null }))}
              className="mt-1 w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-gray-900 dark:text-white"
            >
              <option value="">— не использовать —</option>
              {aiList.map((a) => (
                <option key={a.id} value={a.id}>{a.name} ({a.model})</option>
              ))}
            </select>
          </div>
          <div>
            <h3 className="text-base font-medium text-gray-900 dark:text-white mb-2">2captcha</h3>
            <label className="flex items-center gap-2 mb-2 cursor-pointer">
              <input type="checkbox" checked={form['2captcha'].enabled} onChange={(e) => setForm((p) => ({ ...p, '2captcha': { ...p['2captcha'], enabled: e.target.checked } }))} className="rounded border-gray-300 dark:border-gray-600" />
              <span className="text-sm text-gray-700 dark:text-gray-300">Включить</span>
            </label>
            <Input type="password" value={form['2captcha'].api_key === '***' ? '' : form['2captcha'].api_key} placeholder={form['2captcha'].api_key === '***' ? '••• (не менять)' : 'API ключ 2captcha'} onChange={(e) => setForm((p) => ({ ...p, '2captcha': { ...p['2captcha'], api_key: e.target.value } }))} className="bg-white dark:bg-gray-700" />
          </div>
          <div>
            <h3 className="text-base font-medium text-gray-900 dark:text-white mb-2">Anti-captcha</h3>
            <label className="flex items-center gap-2 mb-2 cursor-pointer">
              <input type="checkbox" checked={form.anticaptcha.enabled} onChange={(e) => setForm((p) => ({ ...p, anticaptcha: { ...p.anticaptcha, enabled: e.target.checked } }))} className="rounded border-gray-300 dark:border-gray-600" />
              <span className="text-sm text-gray-700 dark:text-gray-300">Включить</span>
            </label>
            <Input type="password" value={form.anticaptcha.api_key === '***' ? '' : form.anticaptcha.api_key} placeholder={form.anticaptcha.api_key === '***' ? '••• (не менять)' : 'API ключ Anti-captcha'} onChange={(e) => setForm((p) => ({ ...p, anticaptcha: { ...p.anticaptcha, api_key: e.target.value } }))} className="bg-white dark:bg-gray-700" />
          </div>
          <div className="flex flex-wrap gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
            <Button onClick={handleSave} disabled={saving}>{saving ? 'Сохранение…' : 'Сохранить'}</Button>
            <Button variant="outline" size="sm" onClick={handleTest2} disabled={testing2}>{testing2 ? 'Проверка…' : 'Проверить 2captcha'}</Button>
            <Button variant="outline" size="sm" onClick={handleTestAi} disabled={testingAi}>{testingAi ? 'Проверка…' : 'Проверить AI'}</Button>
          </div>
        </div>
      )}
    </div>
  );
}


'use client';

import { Fragment, useState, useEffect } from 'react';
import {
  Rocket,
  CheckCircle,
  XCircle,
  AlertCircle,
  User,
  RefreshCw,
  Calendar,
  GitBranch,
} from 'lucide-react';
import { ButtonV2 } from '@/components/ui/ButtonV2';
import { CardV2 } from '@/components/ui/CardV2';
import { SignalPill, type SignalTone } from '@/components/ui/SignalPill';

// §4.17 ТЗ редизайна 2026-06-03 (Phase C batch 5): История деплоев на v2.
// Заодно фикс HTML-бага: было <tbody> внутри <tbody> (старый код), теперь
// нормальная структура через Fragment для каждой группы row+changelog.

interface Deployment {
  id: number;
  version: string;
  git_sha: string;
  environment: string;
  changelog: string | null;
  deployed_at: string;
  deployed_by: string | null;
  status: 'success' | 'failed' | 'rolled_back';
}

interface DeploymentsResponse {
  items: Deployment[];
  total: number;
}

async function fetchDeployments(): Promise<DeploymentsResponse> {
  const response = await fetch('/api/v1/deployments?limit=50');
  if (!response.ok) {
    throw new Error('Failed to fetch deployments');
  }
  return response.json();
}

function getStatusIcon(status: string) {
  switch (status) {
    case 'success':
      return <CheckCircle className="h-5 w-5" style={{ color: 'var(--signal-good)' }} />;
    case 'failed':
      return <XCircle className="h-5 w-5" style={{ color: 'var(--signal-hot)' }} />;
    case 'rolled_back':
      return <AlertCircle className="h-5 w-5" style={{ color: 'var(--signal-warm)' }} />;
    default:
      return <Rocket className="h-5 w-5" style={{ color: 'hsl(var(--muted))' }} />;
  }
}

function getStatusLabel(status: string) {
  switch (status) {
    case 'success':
      return 'Успешно';
    case 'failed':
      return 'Ошибка';
    case 'rolled_back':
      return 'Откат';
    default:
      return status;
  }
}

function envBadgeTone(env: string): SignalTone {
  return env === 'production' ? 'good' : 'warm';
}

export default function DeploymentsPage() {
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [data, setData] = useState<DeploymentsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const loadDeployments = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await fetchDeployments();
      setData(result);
    } catch (err) {
      setError(err as Error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadDeployments();
  }, []);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="h-8 w-8 animate-spin" style={{ color: 'hsl(var(--muted))' }} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <XCircle className="h-12 w-12 mx-auto mb-4" style={{ color: 'var(--signal-hot)' }} />
        <p style={{ color: 'hsl(var(--muted))' }}>Ошибка загрузки истории деплоев</p>
        <div className="mt-4 inline-block">
          <ButtonV2 variant="primary" size="md" onClick={() => loadDeployments()}>
            Попробовать снова
          </ButtonV2>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
      <div className="mb-8">
        <h1
          className="flex items-center gap-2 font-display font-semibold tracking-tight"
          style={{ fontSize: 'clamp(1.5rem, 3vw, 2rem)', color: 'hsl(var(--text))' }}
        >
          <Rocket className="h-6 w-6 text-brand-600 dark:text-brand-400" />
          История деплоев
        </h1>
        <p className="mt-1" style={{ color: 'hsl(var(--muted))' }}>
          История всех развертываний приложения
        </p>
      </div>

      <CardV2 className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead style={{ background: 'hsl(var(--surface-2))' }}>
              <tr>
                {['Версия', 'Окружение', 'Статус', 'Дата', 'Автор', 'Commit'].map((label) => (
                  <th
                    key={label}
                    className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider th-muted"
                  >
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data?.items?.map((deployment) => (
                <Fragment key={deployment.id}>
                  <tr
                    className="cursor-pointer transition-colors hover:bg-[hsl(var(--surface-2))]"
                    style={{ borderTop: '1px solid hsl(var(--border))' }}
                    onClick={() =>
                      setExpandedId(expandedId === deployment.id ? null : deployment.id)
                    }
                  >
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className="font-mono font-medium"
                        style={{ color: 'hsl(var(--text))' }}
                      >
                        v{deployment.version}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <SignalPill tone={envBadgeTone(deployment.environment)} size="sm">
                        {deployment.environment}
                      </SignalPill>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        {getStatusIcon(deployment.status)}
                        <span className="text-sm" style={{ color: 'hsl(var(--text))' }}>
                          {getStatusLabel(deployment.status)}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm" style={{ color: 'hsl(var(--muted))' }}>
                      <div className="flex items-center gap-1">
                        <Calendar className="h-4 w-4" />
                        {formatDate(deployment.deployed_at)}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm" style={{ color: 'hsl(var(--muted))' }}>
                      <div className="flex items-center gap-1">
                        <User className="h-4 w-4" />
                        {deployment.deployed_by || '-'}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <code
                        className="px-2 py-1 rounded-v2-sm text-xs font-mono"
                        style={{
                          background: 'hsl(var(--surface-2))',
                          color: 'hsl(var(--text))',
                        }}
                      >
                        {deployment.git_sha.substring(0, 7)}
                      </code>
                    </td>
                  </tr>
                  {expandedId === deployment.id && deployment.changelog && (
                    <tr>
                      <td
                        colSpan={6}
                        className="px-6 py-4"
                        style={{
                          background: 'hsl(var(--surface-2))',
                          borderTop: '1px solid hsl(var(--border))',
                        }}
                      >
                        <div className="max-w-4xl">
                          <h4
                            className="text-sm font-medium mb-2 flex items-center gap-1"
                            style={{ color: 'hsl(var(--text))' }}
                          >
                            <GitBranch className="h-4 w-4" />
                            Changelog
                          </h4>
                          <pre
                            className="text-sm whitespace-pre-wrap p-4 rounded-v2-sm border"
                            style={{
                              background: 'hsl(var(--surface))',
                              borderColor: 'hsl(var(--border))',
                              color: 'hsl(var(--muted))',
                            }}
                          >
                            {deployment.changelog}
                          </pre>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>

        {(!data?.items || data.items.length === 0) && (
          <div className="text-center py-12">
            <Rocket className="h-12 w-12 mx-auto mb-4" style={{ color: 'hsl(var(--muted))' }} />
            <p style={{ color: 'hsl(var(--muted))' }}>История деплоев пуста</p>
          </div>
        )}
      </CardV2>

      <div className="mt-4 text-sm" style={{ color: 'hsl(var(--muted))' }}>
        Всего записей: {data?.total || 0}
      </div>
    </div>
  );
}

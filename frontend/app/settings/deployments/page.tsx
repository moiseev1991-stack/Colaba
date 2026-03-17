'use client';

import { useState, useEffect } from 'react';
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
      return <CheckCircle className="h-5 w-5 text-green-500" />;
    case 'failed':
      return <XCircle className="h-5 w-5 text-red-500" />;
    case 'rolled_back':
      return <AlertCircle className="h-5 w-5 text-yellow-500" />;
    default:
      return <Rocket className="h-5 w-5 text-gray-500" />;
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

function getEnvBadgeColor(env: string) {
  return env === 'production'
    ? 'bg-green-100 text-green-800'
    : 'bg-yellow-100 text-yellow-800';
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
        <RefreshCw className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <XCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
        <p className="text-gray-500">Ошибка загрузки истории деплоев</p>
        <button
          onClick={() => loadDeployments()}
          className="mt-4 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
        >
          Попробовать снова
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <Rocket className="h-6 w-6" />
          История деплоев
        </h1>
        <p className="text-gray-500 mt-1">
          История всех развертываний приложения
        </p>
      </div>

      <div className="bg-white dark:bg-gray-800 shadow rounded-lg overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead className="bg-gray-50 dark:bg-gray-900">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Версия
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Окружение
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Статус
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Дата
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Автор
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Commit
              </th>
            </tr>
          </thead>
          <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
            {data?.items?.map((deployment) => (
              <tbody key={deployment.id}>
                <tr
                  className="hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer"
                  onClick={() =>
                    setExpandedId(expandedId === deployment.id ? null : deployment.id)
                  }
                >
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="font-mono font-medium text-gray-900 dark:text-white">
                      v{deployment.version}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span
                      className={`px-2 py-1 text-xs font-medium rounded-full ${getEnvBadgeColor(
                        deployment.environment
                      )}`}
                    >
                      {deployment.environment}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      {getStatusIcon(deployment.status)}
                      <span className="text-sm text-gray-600 dark:text-gray-300">
                        {getStatusLabel(deployment.status)}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                    <div className="flex items-center gap-1">
                      <Calendar className="h-4 w-4" />
                      {formatDate(deployment.deployed_at)}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                    <div className="flex items-center gap-1">
                      <User className="h-4 w-4" />
                      {deployment.deployed_by || '-'}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <code className="px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded text-xs font-mono text-gray-700 dark:text-gray-300">
                      {deployment.git_sha.substring(0, 7)}
                    </code>
                  </td>
                </tr>
                {expandedId === deployment.id && deployment.changelog && (
                  <tr key={`changelog-${deployment.id}`}>
                    <td colSpan={6} className="px-6 py-4 bg-gray-50 dark:bg-gray-900">
                      <div className="max-w-4xl">
                        <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-1">
                          <GitBranch className="h-4 w-4" />
                          Changelog
                        </h4>
                        <pre className="text-sm text-gray-600 dark:text-gray-400 whitespace-pre-wrap bg-white dark:bg-gray-800 p-4 rounded border border-gray-200 dark:border-gray-700">
                          {deployment.changelog}
                        </pre>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            ))}
          </tbody>
        </table>

        {(!data?.items || data.items.length === 0) && (
          <div className="text-center py-12">
            <Rocket className="h-12 w-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500 dark:text-gray-400">
              История деплоев пуста
            </p>
          </div>
        )}
      </div>

      <div className="mt-4 text-sm text-gray-500 dark:text-gray-400">
        Всего записей: {data?.total || 0}
      </div>
    </div>
  );
}

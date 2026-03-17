'use client';

import { useState } from 'react';

const versionInfo = {
  version: process.env.NEXT_PUBLIC_APP_VERSION || '0.0.0-dev',
  gitSha: process.env.NEXT_PUBLIC_GIT_SHA || 'local',
  buildTime: process.env.NEXT_PUBLIC_BUILD_TIME || new Date().toISOString(),
};

export function VersionBadge() {
  const [expanded, setExpanded] = useState(false);

  const formatBuildTime = (isoString: string) => {
    try {
      const date = new Date(isoString);
      return date.toLocaleString('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return isoString;
    }
  };

  return (
    <div className="text-xs text-gray-500 dark:text-gray-400">
      {expanded ? (
        <div className="space-y-1 p-2 bg-gray-50 dark:bg-gray-800 rounded">
          <div className="font-medium">v{versionInfo.version}</div>
          <div className="flex items-center gap-1">
            <span className="text-gray-400">Commit:</span>
            <code className="px-1 bg-gray-200 dark:bg-gray-700 rounded text-[10px]">
              {versionInfo.gitSha.substring(0, 7)}
            </code>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-gray-400">Build:</span>
            <span>{formatBuildTime(versionInfo.buildTime)}</span>
          </div>
          <button
            onClick={() => setExpanded(false)}
            className="text-blue-500 hover:text-blue-600 text-[10px]"
          >
            Свернуть
          </button>
        </div>
      ) : (
        <button
          onClick={() => setExpanded(true)}
          className="hover:text-gray-700 dark:hover:text-gray-300 flex items-center gap-1"
          title="Нажмите для подробностей"
        >
          <span>v{versionInfo.version}</span>
          <code className="px-1 bg-gray-100 dark:bg-gray-800 rounded text-[10px]">
            {versionInfo.gitSha.substring(0, 7)}
          </code>
        </button>
      )}
    </div>
  );
}

'use client';

import { useState } from 'react';

// §4.19 ТЗ редизайна 2026-06-03 (Phase C batch 9): VersionBadge на v2.

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

  const codeStyle = {
    background: 'hsl(var(--surface-2))',
    color: 'hsl(var(--text))',
  } as const;

  // 2026-06-19: SHA приходит как 'unknown' или 'local', когда build
  // не прокинул --build-arg GIT_SHA (актуально в Coolify / dev / local
  // docker build без CI). В этом случае нет смысла показывать «code
  // badge» — это шум, юзер уже видел рядом с версией. Скрываем.
  const hasRealSha =
    versionInfo.gitSha &&
    versionInfo.gitSha !== 'unknown' &&
    versionInfo.gitSha !== 'local';

  return (
    <div className="text-xs td-muted">
      {expanded ? (
        <div
          className="space-y-1 p-2 rounded-v2-sm"
          style={{ background: 'hsl(var(--surface-2))' }}
        >
          <div className="font-medium">v{versionInfo.version}</div>
          {hasRealSha && (
            <div className="flex items-center gap-1">
              <span style={{ color: 'hsl(var(--muted))' }}>Commit:</span>
              <code className="px-1 rounded text-[10px]" style={codeStyle}>
                {versionInfo.gitSha.substring(0, 7)}
              </code>
            </div>
          )}
          <div className="flex items-center gap-1">
            <span style={{ color: 'hsl(var(--muted))' }}>Build:</span>
            <span>{formatBuildTime(versionInfo.buildTime)}</span>
          </div>
          <button
            onClick={() => setExpanded(false)}
            className="text-brand-600 dark:text-brand-400 hover:underline text-[10px]"
          >
            Свернуть
          </button>
        </div>
      ) : (
        <button
          onClick={() => setExpanded(true)}
          className="flex items-center gap-1 transition-colors hover:text-[hsl(var(--text))]"
          title="Нажмите для подробностей"
        >
          <span>v{versionInfo.version}</span>
          {hasRealSha && (
            <code className="px-1 rounded text-[10px]" style={codeStyle}>
              {versionInfo.gitSha.substring(0, 7)}
            </code>
          )}
        </button>
      )}
    </div>
  );
}

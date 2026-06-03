'use client';

import { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  demo?: ReactNode;
  demoNote?: ReactNode;
  className?: string;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  demo,
  demoNote,
  className,
}: EmptyStateProps) {
  return (
    <div className={cn('space-y-6', className)}>
      <div
        className="px-6 py-12 text-center"
        style={{
          background: 'hsl(var(--surface))',
          border: '1px dashed hsl(var(--border))',
          borderRadius: 6,
        }}
      >
        {icon && (
          <div
            className="inline-flex items-center justify-center w-14 h-14 mb-4"
            style={{
              background: 'hsl(var(--accent-weak))',
              border: '1px solid hsl(var(--accent) / 0.25)',
              borderRadius: 6,
              color: 'hsl(var(--accent))',
            }}
          >
            {icon}
          </div>
        )}
        <h3 className="text-[16px] font-bold mb-2" style={{ color: 'hsl(var(--text))' }}>
          {title}
        </h3>
        {description && (
          <div
            className="text-[13px] max-w-[480px] mx-auto leading-snug"
            style={{ color: 'hsl(var(--muted))' }}
          >
            {description}
          </div>
        )}
        {action && <div className="mt-5 inline-flex justify-center">{action}</div>}
      </div>

      {demo && (
        <div
          className="overflow-hidden"
          style={{
            background: 'hsl(var(--surface))',
            border: '1px solid hsl(var(--border))',
            borderRadius: 6,
          }}
        >
          <div
            className="px-4 py-2.5 flex items-center gap-2"
            style={{
              borderBottom: '1px solid hsl(var(--border))',
              background: 'rgb(252 211 77 / 0.08)',
            }}
          >
            <span className="inline-flex items-center px-1.5 h-5 text-[10px] font-bold uppercase tracking-wider rounded-v2-sm bg-[var(--signal-warm-bg)] text-[color:var(--signal-warm)] border border-[color:var(--signal-warm)]/40">
              Пример
            </span>
            <span className="text-xs" style={{ color: 'hsl(var(--muted))' }}>
              {demoNote ?? 'демо-данные — не ваши'}
            </span>
          </div>
          {demo}
        </div>
      )}
    </div>
  );
}

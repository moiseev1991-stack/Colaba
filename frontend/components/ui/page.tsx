import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * PageContainer — одна ширина страниц кабинета (PR 3.3): до 1600px с полями.
 * Раньше у страниц были свои ширины: 1000, 1100, 1200, 1250, 1400px и max-w-7xl.
 */
export function PageContainer({ className, children, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-6 sm:py-8', className)} {...rest}>
      {children}
    </div>
  );
}

interface PageHeaderProps {
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Кнопки справа от заголовка; на узком экране переносятся под него. */
  actions?: React.ReactNode;
  className?: string;
}

/** PageHeader — один стиль заголовка страницы: H1 28px Manrope, описание и действия. */
export function PageHeader({ title, description, actions, className }: PageHeaderProps) {
  return (
    <div className={cn('mb-6 flex flex-wrap items-start justify-between gap-4', className)}>
      <div className="min-w-0">
        <h1 className="text-heading font-semibold tracking-tight text-ui-text">{title}</h1>
        {description && <p className="mt-1 max-w-3xl text-sm text-ui-text-muted">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

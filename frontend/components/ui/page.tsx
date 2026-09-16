import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * PageContainer — одна ширина страниц кабинета: до 1232px с полями, как шапка (вид Premium, 16.09).
 * Раньше у страниц были свои ширины: 1000, 1100, 1200, 1250, 1400px и max-w-7xl.
 * Hero-страницы (форма поиска, боли) передают свой вертикальный ритм через className.
 */
export function PageContainer({
  className,
  children,
  ...rest
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('mx-auto w-full max-w-[1232px] px-4 py-6 sm:px-6 sm:py-10', className)}
      {...rest}
    >
      {children}
    </div>
  );
}

/**
 * PageColumn — узкая контентная колонка ВНУТРИ PageContainer для форм и
 * настроек (760px, по центру). Страница остаётся на единой сетке 1232px —
 * шапка и контейнер не прыгают, а форма не растягивается на всю ширину.
 */
export function PageColumn({ className, children, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('mx-auto w-full max-w-[760px]', className)} {...rest}>
      {children}
    </div>
  );
}

export interface Crumb {
  label: string;
  href?: string;
}

interface PageHeaderProps {
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Хлебные крошки над заголовком (последняя — текущая страница, без ссылки). */
  breadcrumbs?: Crumb[];
  /** Кнопки справа от заголовка; на узком экране переносятся под него. */
  actions?: React.ReactNode;
  className?: string;
}

/** PageHeader — один стиль заголовка страницы: H1 28px Manrope, крошки, описание и действия. */
export function PageHeader({
  title,
  description,
  breadcrumbs,
  actions,
  className,
}: PageHeaderProps) {
  return (
    <div className={cn('mb-6 flex flex-wrap items-start justify-between gap-4', className)}>
      <div className="min-w-0">
        {breadcrumbs && breadcrumbs.length > 0 && (
          <nav
            aria-label="Хлебные крошки"
            className="mb-1.5 flex flex-wrap items-center gap-1.5 text-small text-ui-text-muted"
          >
            {breadcrumbs.map((c, i) => {
              const last = i === breadcrumbs.length - 1;
              return (
                <React.Fragment key={`${c.label}-${i}`}>
                  {i > 0 && <span aria-hidden>·</span>}
                  {last || !c.href ? (
                    <span aria-current={last ? 'page' : undefined}>{c.label}</span>
                  ) : (
                    <a href={c.href} className="transition-colors hover:text-ui-text">
                      {c.label}
                    </a>
                  )}
                </React.Fragment>
              );
            })}
          </nav>
        )}
        <h1 className="text-heading font-extrabold tracking-tight text-ui-text">{title}</h1>
        {description && <p className="mt-1 max-w-3xl text-sm text-ui-text-muted">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

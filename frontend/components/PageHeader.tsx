'use client';

import Link from 'next/link';
import { ChevronRight } from 'lucide-react';

// §4.19 ТЗ редизайна 2026-06-03 (Phase C batch 9): PageHeader на v2 — breadcrumbs + h1.

export type BreadcrumbItem = {
  label: string;
  href?: string;
};

interface PageHeaderProps {
  breadcrumb?: BreadcrumbItem[];
  title: string;
  actions?: React.ReactNode;
}

export function PageHeader({ breadcrumb, title, actions }: PageHeaderProps) {
  return (
    <header
      className="mb-4 border-b px-4 py-2.5 min-h-[44px] flex items-center"
      style={{
        background: 'hsl(var(--surface-2) / 0.6)',
        borderColor: 'hsl(var(--border))',
      }}
    >
      <div className="page-header-inner flex flex-col md:flex-row md:flex-wrap items-start md:items-center justify-between gap-2 md:gap-3 w-full">
        <div className="min-w-0 w-full md:flex-1">
          {breadcrumb && breadcrumb.length > 0 && (
            <nav
              className="flex items-center gap-1 text-xs mb-1"
              style={{ color: 'hsl(var(--muted))' }}
            >
              {breadcrumb.map((item, i) => (
                <span key={i} className="flex items-center gap-1">
                  {i > 0 && <ChevronRight className="h-3 w-3 shrink-0 opacity-60" />}
                  {item.href ? (
                    <Link
                      href={item.href}
                      className="transition-colors hover:text-[hsl(var(--text))]"
                    >
                      {item.label}
                    </Link>
                  ) : (
                    <span>{item.label}</span>
                  )}
                </span>
              ))}
            </nav>
          )}
          <h1
            className="font-display font-semibold tracking-tight text-base sm:text-lg leading-tight"
            style={{ color: 'hsl(var(--text))' }}
          >
            {title}
          </h1>
        </div>
        {actions && (
          <div className="flex items-center gap-2 shrink-0 w-full md:w-auto">
            {actions}
          </div>
        )}
      </div>
    </header>
  );
}

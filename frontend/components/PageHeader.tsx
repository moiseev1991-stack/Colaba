'use client';

import Link from 'next/link';
import { ChevronRight } from 'lucide-react';

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
    <header className="mb-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50/80 dark:bg-gray-800/40 px-4 py-2.5 min-h-[44px] flex items-center">
      <div className="flex flex-wrap items-center justify-between gap-3 w-full">
        <div className="min-w-0 flex-1">
          {breadcrumb && breadcrumb.length > 0 && (
            <nav className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 mb-1">
              {breadcrumb.map((item, i) => (
                <span key={i} className="flex items-center gap-1">
                  {i > 0 && <ChevronRight className="h-3 w-3 shrink-0 opacity-60" />}
                  {item.href ? (
                    <Link href={item.href} className="hover:text-gray-700 dark:hover:text-gray-300 transition-colors">
                      {item.label}
                    </Link>
                  ) : (
                    <span>{item.label}</span>
                  )}
                </span>
              ))}
            </nav>
          )}
          <h1 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-white leading-tight">
            {title}
          </h1>
        </div>
        {actions && (
          <div className="flex items-center gap-2 shrink-0">
            {actions}
          </div>
        )}
      </div>
    </header>
  );
}

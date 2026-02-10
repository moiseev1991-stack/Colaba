'use client';

import Link from 'next/link';
import { Search, Users, BarChart3 } from 'lucide-react';

const modules = [
  { id: 'seo', title: 'SEO', desc: 'Аудит, проверки, история запросов', icon: Search, href: '/app/seo' },
  { id: 'leads', title: 'Поиск лидов', desc: 'Поиск, контакты, экспорт', icon: Users, href: '/app/leads' },
  { id: 'gos', title: 'Госзакупки', desc: 'Мониторинг, история, фильтры', icon: BarChart3, href: '/app/gos' },
];

export default function DashboardPage() {
  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <h1 className="text-[20px] font-semibold" style={{ color: 'hsl(var(--text))' }}>
        Выберите раздел
      </h1>
      <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {modules.map((m) => {
          const Icon = m.icon;
          return (
            <Link
              key={m.id}
              href={m.href}
              className="group rounded-[8px] border p-6 transition-colors hover:border-[hsl(var(--accent))]/40"
              style={{ backgroundColor: 'hsl(var(--surface))', borderColor: 'hsl(var(--border))' }}
            >
              <Icon className="mb-3 h-8 w-8" style={{ color: 'hsl(var(--accent))' }} />
              <h2 className="text-[16px] font-semibold" style={{ color: 'hsl(var(--text))' }}>{m.title}</h2>
              <p className="mt-1 text-[14px]" style={{ color: 'hsl(var(--muted))' }}>{m.desc}</p>
              <span className="mt-4 inline-block text-[14px] font-medium" style={{ color: 'hsl(var(--accent))' }}>
                Открыть →
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

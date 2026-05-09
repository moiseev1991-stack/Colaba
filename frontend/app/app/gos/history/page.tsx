import { Search, Package } from 'lucide-react';
import Link from 'next/link';

export default function GosHistoryPage() {

  return (
    <div className="mx-auto max-w-[1100px] px-6 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-[20px] font-semibold" style={{ color: 'hsl(var(--text))' }}>История поиска госзакупок</h1>
        <Link
          href="/app/gos"
          className="inline-flex items-center gap-1.5 rounded-[8px] border px-3 py-1.5 text-sm transition-colors"
          style={{
            background: 'hsl(var(--surface))',
            borderColor: 'hsl(var(--border))',
            color: 'hsl(var(--text))',
          }}
        >
          <Search className="h-4 w-4" /> Новый поиск
        </Link>
      </div>

      <div
        className="rounded-[12px] border p-6"
        style={{ background: 'hsl(var(--surface))', borderColor: 'hsl(var(--border))' }}
      >
        <div className="py-10 text-center">
          <Package className="h-10 w-10 mx-auto mb-3" style={{ color: 'hsl(var(--muted))', opacity: 0.5 }} />
          <p className="text-sm" style={{ color: 'hsl(var(--muted))' }}>
            История поисков сохраняется в браузере.<br />Переходите на вкладку поиска, чтобы найти тендеры.
          </p>
        </div>
      </div>
    </div>
  );
}

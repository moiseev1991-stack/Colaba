'use client';

import { useEffect } from 'react';
import { AlertCircle } from 'lucide-react';
import { ButtonV2 } from '@/components/ui/ButtonV2';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="min-h-[400px] flex flex-col items-center justify-center gap-4 px-4">
      <div
        className="rounded-v2-sm p-3"
        style={{ background: 'var(--signal-hot-bg)', color: 'var(--signal-hot)' }}
      >
        <AlertCircle className="h-6 w-6" />
      </div>
      <h2
        className="font-display font-semibold tracking-tight text-xl"
        style={{ color: 'hsl(var(--text))' }}
      >
        Что-то пошло не так
      </h2>
      <p
        className="text-sm text-center max-w-md"
        style={{ color: 'hsl(var(--muted))' }}
      >
        {error.message}
      </p>
      <ButtonV2 variant="primary" size="md" onClick={reset}>
        Попробовать снова
      </ButtonV2>
    </div>
  );
}

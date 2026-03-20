'use client';

import { useEffect } from 'react';

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
      <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
        Что-то пошло не так
      </h2>
      <p className="text-sm text-gray-600 dark:text-gray-400 text-center max-w-md">
        {error.message}
      </p>
      <button
        onClick={reset}
        className="inline-flex items-center justify-center rounded-[10px] px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 text-sm font-medium"
      >
        Попробовать снова
      </button>
    </div>
  );
}

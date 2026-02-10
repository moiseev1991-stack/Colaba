'use client';

import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react';

const DEFAULT_STEPS = [
  'Парсим выдачу поисковой системы',
  'Собираем домены',
  'Ищем robots.txt и sitemap',
  'Проверяем мета-теги и H1',
];

interface ProcessStepsIndicatorProps {
  title?: string;
  steps?: string[];
  intervalMs?: number;
}

export function ProcessStepsIndicator({
  title = 'Идёт сбор результатов…',
  steps = DEFAULT_STEPS,
  intervalMs = 700,
}: ProcessStepsIndicatorProps) {
  const [activeStep, setActiveStep] = useState(0);

  useEffect(() => {
    const t = setInterval(() => {
      setActiveStep((prev) => (prev + 1) % steps.length);
    }, intervalMs);
    return () => clearInterval(t);
  }, [steps.length, intervalMs]);

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium text-gray-900 dark:text-white">{title}</h3>
      <div className="space-y-2">
        {steps.map((step, index) => (
          <div
            key={index}
            className={cn(
              'flex items-center gap-2 text-sm transition-all',
              activeStep === index ? 'text-gray-900 dark:text-white' : 'text-gray-500 dark:text-gray-400'
            )}
          >
            {activeStep === index ? (
              <Loader2 className="w-4 h-4 animate-spin text-red-600 dark:text-red-500 flex-shrink-0" />
            ) : (
              <div className="w-4 h-4 flex-shrink-0" />
            )}
            <span>{step}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

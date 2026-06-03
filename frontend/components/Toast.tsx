'use client';

import { useEffect } from 'react';
import { X, CheckCircle, XCircle, Info } from 'lucide-react';
import { Button } from './ui/button';

export type ToastType = 'success' | 'error' | 'info';

export interface Toast {
  id: string;
  message: string;
  type: ToastType;
}

interface ToastProps {
  toast: Toast;
  onClose: (id: string) => void;
}

export function Toast({ toast, onClose }: ToastProps) {
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose(toast.id);
    }, 3000);

    return () => clearTimeout(timer);
  }, [toast.id, onClose]);

  const icons = {
    success: <CheckCircle className="h-5 w-5" style={{ color: 'var(--signal-good)' }} />,
    error: <XCircle className="h-5 w-5" style={{ color: 'var(--signal-hot)' }} />,
    info: <Info className="h-5 w-5" style={{ color: 'var(--signal-cool)' }} />,
  };

  // §4.19 ТЗ редизайна 2026-06-03 (Phase C batch 9): Toast на signal-токены.
  const bgColors = {
    success: 'bg-[var(--signal-good-bg)] border-[color:var(--signal-good)]/30',
    error: 'bg-[var(--signal-hot-bg)] border-[color:var(--signal-hot)]/30',
    info: 'bg-[var(--signal-cool-bg)] border-[color:var(--signal-cool)]/30',
  };

  const textColors = {
    success: 'text-[color:var(--signal-good)]',
    error: 'text-[color:var(--signal-hot)]',
    info: 'text-[color:var(--signal-cool)]',
  };

  return (
    <div
      className={`flex items-center gap-3 px-4 py-3 rounded-v2-sm border ${bgColors[toast.type]} ${textColors[toast.type]} shadow-v2 min-w-[300px] max-w-md`}
    >
      {icons[toast.type]}
      <p className="flex-1 text-sm font-medium">{toast.message}</p>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => onClose(toast.id)}
        className="h-6 w-6"
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}

interface ToastContainerProps {
  toasts: Toast[];
  onClose: (id: string) => void;
}

export function ToastContainer({ toasts, onClose }: ToastContainerProps) {
  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-20 right-4 z-50 flex flex-col gap-2">
      {toasts.map((toast) => (
        <Toast key={toast.id} toast={toast} onClose={onClose} />
      ))}
    </div>
  );
}

'use client';

import * as React from 'react';
import { Button } from './button';
import { Dialog, DialogFooter } from './dialog';

/**
 * Подтверждение действия (PR 3.3b) — замена window.confirm() на Dialog кабинета.
 * Вызывается откуда угодно: `if (!(await confirmDialog({ title: 'Удалить список?' }))) return;`
 * Один <ConfirmHost /> смонтирован в AppShell. Фокус при открытии — на «Отмене».
 */

interface ConfirmOptions {
  title: string;
  description?: string;
  /** Текст кнопки подтверждения; по умолчанию «Удалить». */
  confirmLabel?: string;
  cancelLabel?: string;
  /** Красная кнопка подтверждения; по умолчанию true — большинство подтверждений про удаление. */
  danger?: boolean;
}

interface PendingConfirm extends ConfirmOptions {
  resolve: (ok: boolean) => void;
}

let pending: PendingConfirm | null = null;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function confirmDialog(options: ConfirmOptions | string): Promise<boolean> {
  const opts = typeof options === 'string' ? { title: options } : options;
  // Если уже открыто другое подтверждение — считаем его отменённым.
  pending?.resolve(false);
  return new Promise((resolve) => {
    pending = { ...opts, resolve };
    emit();
  });
}

function settle(ok: boolean) {
  const current = pending;
  pending = null;
  emit();
  current?.resolve(ok);
}

export function ConfirmHost() {
  const current = React.useSyncExternalStore(subscribe, () => pending, () => null);

  return (
    <Dialog open={current !== null} onClose={() => settle(false)} title={current?.title}>
      {current?.description && <p className="whitespace-pre-line text-sm text-ui-text-muted">{current.description}</p>}
      <DialogFooter className={current?.description ? undefined : 'mt-0'}>
        <Button variant="secondary" onClick={() => settle(false)}>
          {current?.cancelLabel ?? 'Отмена'}
        </Button>
        <Button variant={current?.danger === false ? 'primary' : 'danger'} onClick={() => settle(true)}>
          {current?.confirmLabel ?? 'Удалить'}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}

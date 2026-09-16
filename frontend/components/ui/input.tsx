'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

/** Общие классы полей ввода (Input, Select, Textarea) — на семантических токенах (PR 3.3). */
// Вид Premium (16.09): серая заливка без рамки, в фокусе — белое поле с изумрудной рамкой и мягким кольцом.
export const fieldClass =
  'flex w-full rounded-control border border-transparent bg-ui-surface-2 px-3 py-2 text-sm text-ui-text ' +
  'placeholder:text-ui-text-muted/80 hover:border-control-border-hover ' +
  'focus-visible:outline-none focus-visible:border-ui-accent focus-visible:bg-ui-surface focus-visible:ring-4 focus-visible:ring-ui-accent/15 ' +
  'disabled:cursor-not-allowed disabled:opacity-50 aria-[invalid=true]:border-ui-danger';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  /** Ошибка валидации: красная рамка и aria-invalid для скринридеров. */
  invalid?: boolean;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(({ className, type, invalid, ...props }, ref) => (
  <input
    ref={ref}
    type={type}
    aria-invalid={invalid || undefined}
    className={cn(fieldClass, 'h-9 file:border-0 file:bg-transparent file:text-sm file:font-medium', className)}
    {...props}
  />
));
Input.displayName = 'Input';

export { Input };

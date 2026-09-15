'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { fieldClass } from './input';

/** Textarea — многострочное поле в стиле Input (PR 3.3). */
export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, invalid, rows = 4, ...props }, ref) => (
    <textarea
      ref={ref}
      rows={rows}
      aria-invalid={invalid || undefined}
      className={cn(fieldClass, 'min-h-[80px] resize-y leading-relaxed', className)}
      {...props}
    />
  ),
);
Textarea.displayName = 'Textarea';

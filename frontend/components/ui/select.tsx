'use client';

import * as React from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { fieldClass } from './input';

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  invalid?: boolean;
  /** Классы обёртки: например, block — чтобы поле заняло всю ширину. */
  wrapperClassName?: string;
}

const Select = React.forwardRef<HTMLSelectElement, SelectProps>(({ className, wrapperClassName, children, invalid, ...props }, ref) => (
  <div className={cn('relative inline-block', wrapperClassName)}>
    <select
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn(fieldClass, 'h-9 cursor-pointer appearance-none pr-9', className)}
      {...props}
    >
      {children}
    </select>
    <ChevronDown
      className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ui-text-muted"
      aria-hidden
    />
  </div>
));
Select.displayName = 'Select';

export { Select };

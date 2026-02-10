'use client';

import * as React from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {}

const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <div className="relative inline-block">
        <select
        className={cn(
          'flex w-full rounded-[10px] border border-control-border bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white px-3 py-2 pr-9 text-sm appearance-none cursor-pointer',
          'hover:border-control-border-hover hover:bg-gray-200 dark:hover:bg-gray-600',
          'focus:outline-none focus:border-control-border-focus focus:ring-[3px] focus:ring-focus-ring focus:ring-offset-0',
          'disabled:cursor-not-allowed disabled:opacity-50 h-9',
          className
        )}
          ref={ref}
          {...props}
        >
          {children}
        </select>
        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-700 dark:text-white pointer-events-none" />
      </div>
    );
  }
);
Select.displayName = 'Select';

export { Select };

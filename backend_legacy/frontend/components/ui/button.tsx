'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost';
  size?: 'default' | 'sm' | 'lg' | 'icon';
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', size = 'default', ...props }, ref) => {
    return (
      <button
        className={cn(
          'inline-flex items-center justify-center rounded-[10px] text-sm font-medium whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-saas-primary focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 min-w-[96px]',
          {
            'bg-saas-primary text-white hover:bg-saas-primary-hover': variant === 'default',
            'bg-saas-danger text-white hover:bg-saas-danger-hover': variant === 'destructive',
            'border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-saas-primary-weak dark:hover:bg-saas-primary-weak/20 min-w-0': variant === 'outline',
            'border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-saas-primary-weak dark:hover:bg-saas-primary-weak/20 min-w-0': variant === 'secondary',
            'bg-transparent hover:bg-saas-primary-weak dark:hover:bg-saas-primary-weak/20 min-w-0': variant === 'ghost',
            'h-9 px-3 py-2': size === 'default',
            'h-8 px-2.5 min-w-0': size === 'sm',
            'h-9 px-6 min-w-0': size === 'lg',
            'h-9 w-9 min-w-0 p-0': size === 'icon',
          },
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = 'Button';

export { Button };

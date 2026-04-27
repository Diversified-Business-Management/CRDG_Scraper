import * as React from 'react';
import { cn } from '@/lib/utils';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'outline' | 'secondary';
}

export function Badge({ className, variant = 'default', ...props }: BadgeProps) {
  const variantClass =
    variant === 'outline'
      ? 'border bg-transparent'
      : variant === 'secondary'
        ? 'bg-secondary text-secondary-foreground border-transparent'
        : 'bg-primary text-primary-foreground border-transparent';
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium',
        variantClass,
        className
      )}
      {...props}
    />
  );
}

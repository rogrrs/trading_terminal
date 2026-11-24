import * as React from 'react';
import { cn } from '@/lib/utils';

function Badge({ className, variant = 'secondary', ...props }: React.HTMLAttributes<HTMLDivElement> & {
  variant?: 'default' | 'secondary' | 'destructive' | 'outline' | 'up' | 'down';
}) {
  return (
    <div
      className={cn(
        'inline-flex items-center rounded-sm border px-1.5 py-0.5 text-[10px] font-semibold transition-colors',
        variant === 'default' && 'border-transparent bg-primary text-primary-foreground',
        variant === 'secondary' && 'border-transparent bg-secondary text-secondary-foreground',
        variant === 'destructive' && 'border-transparent bg-destructive/15 text-destructive',
        variant === 'outline' && 'text-foreground',
        variant === 'up' && 'border-transparent bg-up/15 text-up',
        variant === 'down' && 'border-transparent bg-down/15 text-down',
        className,
      )}
      {...props}
    />
  );
}

export { Badge };

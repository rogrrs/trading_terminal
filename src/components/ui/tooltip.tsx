import * as React from 'react';
import { Tooltip as TooltipPrimitive } from 'radix-ui';
import { cn } from '@/lib/utils';

const TooltipProvider = TooltipPrimitive.Provider;
const TooltipRoot = TooltipPrimitive.Root;

function Tooltip({ children, content, side = 'top', className, ...props }: React.ComponentProps<typeof TooltipPrimitive.Content> & {
  children: React.ReactNode;
  content: React.ReactNode;
  side?: React.ComponentProps<typeof TooltipPrimitive.Content>['side'];
}) {
  return (
    <TooltipRoot>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={side}
          sideOffset={6}
          className={cn(
            'z-50 overflow-hidden rounded-md bg-popover px-2 py-1 text-[11px] text-popover-foreground shadow-md border border-border',
            className,
          )}
          {...props}
        >
          {content}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipRoot>
  );
}

export { Tooltip, TooltipProvider, TooltipRoot };

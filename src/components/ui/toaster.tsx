import { Toast } from 'radix-ui';
import { X } from 'lucide-react';
import { create } from 'zustand';
import { uid } from '@/lib/utils';
import { cn } from '@/lib/utils';

export interface ToastItem {
  id: string;
  title: string;
  description?: string;
  variant?: 'default' | 'destructive' | 'success';
}

interface ToastState {
  toasts: ToastItem[];
  push: (toast: ToastItem) => void;
  dismiss: (id: string) => void;
}

const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  push: (toast) => set((state) => ({ toasts: [...state.toasts, toast].slice(-4) })),
  dismiss: (id) => set((state) => ({ toasts: state.toasts.filter((item) => item.id !== id) })),
}));

export function toast(input: Omit<ToastItem, 'id'>) {
  const item: ToastItem = { id: uid('toast'), ...input };
  useToastStore.getState().push(item);
  window.setTimeout(() => useToastStore.getState().dismiss(item.id), 4500);
  return item.id;
}

export function Toaster() {
  const toasts = useToastStore((state) => state.toasts);
  const dismiss = useToastStore((state) => state.dismiss);

  return (
    <Toast.Provider swipeDirection="right" duration={4500}>
      {toasts.map((item) => (
        <Toast.Root
          key={item.id}
          open
          onOpenChange={(open) => {
            if (!open) dismiss(item.id);
          }}
          className={cn(
            'flex w-[320px] items-start gap-2 rounded-md border bg-popover p-3 text-popover-foreground shadow-lg data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:slide-in-from-right',
            item.variant === 'destructive' && 'border-destructive/50',
          )}
        >
          <div className="min-w-0 flex-1">
            <Toast.Title className="text-xs font-semibold">{item.title}</Toast.Title>
            {item.description && (
              <Toast.Description className="mt-0.5 text-[11px] text-muted-foreground">
                {item.description}
              </Toast.Description>
            )}
          </div>
          <Toast.Close className="rounded p-0.5 opacity-60 transition-opacity hover:opacity-100">
            <X className="h-3.5 w-3.5" />
          </Toast.Close>
        </Toast.Root>
      ))}
      <Toast.Viewport className="fixed bottom-16 right-3 z-[100] flex flex-col gap-2 outline-none md:bottom-4 md:right-4" />
    </Toast.Provider>
  );
}

export function useToasts() {
  return useToastStore((state) => state.toasts);
}

export const toastDismiss = (id: string) => useToastStore.getState().dismiss(id);

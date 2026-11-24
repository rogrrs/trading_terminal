import { useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  ListPlus,
  MoreHorizontal,
  Pencil,
  Plus,
  Star,
  Trash2,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tooltip } from '@/components/ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useTerminalStore } from '@/stores/terminal';
import { useWatchlistStore } from '@/stores/watchlist';
import { useWatchlistPrices } from './useWatchlistPrices';
import { cn, formatPrice, precisionForPrice } from '@/lib/utils';

export function WatchlistPanel() {
  const groups = useWatchlistStore((state) => state.groups);
  const instruments = useWatchlistStore((state) => state.instruments);
  const activeGroupId = useWatchlistStore((state) => state.activeGroupId);
  const setActiveGroup = useWatchlistStore((state) => state.setActiveGroup);
  const createGroup = useWatchlistStore((state) => state.createGroup);
  const renameGroup = useWatchlistStore((state) => state.renameGroup);
  const deleteGroup = useWatchlistStore((state) => state.deleteGroup);
  const toggle = useWatchlistStore((state) => state.toggle);
  const reorder = useWatchlistStore((state) => state.reorder);

  const instrument = useTerminalStore((state) => state.instrument);
  const setInstrument = useTerminalStore((state) => state.setInstrument);

  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState('');

  const active = groups.find((group) => group.id === activeGroupId) ?? groups[0];
  const ids = active?.items ?? [];
  const prices = useWatchlistPrices(ids);

  const submitCreate = () => {
    const name = newName.trim();
    if (!name) return;
    createGroup(name);
    setNewName('');
    setCreating(false);
  };

  return (
    <aside className="flex h-full w-full shrink-0 flex-col border-r bg-card md:w-[236px]">
      <div className="flex h-10 shrink-0 items-center gap-1 border-b px-2">
        <span className="text-xs font-semibold">Списки</span>
        <span className="text-[10px] text-muted-foreground">{ids.length}</span>
        <div className="ml-auto flex items-center gap-0.5">
          {active && active.id !== 'favorites' ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label="Управление списком">
                  <MoreHorizontal className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuLabel>{active.name}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onSelect={() => {
                    setRenameValue(active.name);
                    setRenaming(true);
                  }}
                >
                  <Pencil className="mr-2 h-3.5 w-3.5" /> Переименовать
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="text-destructive"
                  onSelect={() => deleteGroup(active.id)}
                >
                  <Trash2 className="mr-2 h-3.5 w-3.5" /> Удалить список
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
          <Tooltip content="Новый список">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setCreating(true)}
              aria-label="Новый список"
            >
              <ListPlus className="h-3.5 w-3.5" />
            </Button>
          </Tooltip>
        </div>
      </div>

      <div className="no-scrollbar flex shrink-0 gap-1 overflow-x-auto border-b px-2 py-1.5">
        {groups.map((group) => (
          <button
            key={group.id}
            type="button"
            onClick={() => setActiveGroup(group.id)}
            className={cn(
              'h-6 shrink-0 rounded-full border px-2 text-[10px] font-medium transition-colors',
              group.id === activeGroupId
                ? 'border-primary/40 bg-primary/15 text-primary'
                : 'border-transparent text-muted-foreground hover:bg-accent hover:text-foreground',
            )}
          >
            {group.name}
            <span className="ml-1 opacity-60">{group.items.length}</span>
          </button>
        ))}
      </div>

      {creating && (
        <div className="flex shrink-0 items-center gap-1 border-b px-2 py-1.5">
          <Input
            autoFocus
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') submitCreate();
              if (event.key === 'Escape') setCreating(false);
            }}
            placeholder="Название списка"
            className="h-7 text-[11px]"
          />
          <Button size="sm" className="h-7 px-2 text-[11px]" onClick={submitCreate}>
            OK
          </Button>
        </div>
      )}

      {renaming && active ? (
        <div className="flex shrink-0 items-center gap-1 border-b px-2 py-1.5">
          <Input
            autoFocus
            value={renameValue}
            onChange={(event) => setRenameValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                renameGroup(active.id, renameValue);
                setRenaming(false);
              }
              if (event.key === 'Escape') setRenaming(false);
            }}
            className="h-7 text-[11px]"
          />
          <Button
            size="sm"
            className="h-7 px-2 text-[11px]"
            onClick={() => {
              renameGroup(active.id, renameValue);
              setRenaming(false);
            }}
          >
            OK
          </Button>
        </div>
      ) : null}

      <div className="no-scrollbar flex min-h-0 flex-1 flex-col overflow-y-auto">
        {ids.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-1.5 px-3 text-center">
            <Star className="h-5 w-5 text-muted-foreground/60" />
            <p className="text-[11px] text-muted-foreground">
              Список пуст. Добавьте инструмент кнопкой со звездой в поиске.
            </p>
          </div>
        ) : (
          ids.map((id, index) => {
            const item = instruments[id];
            if (!item) return null;
            const price = prices[id];
            const activeInstrument = instrument?.id === id;
            return (
              <div
                key={id}
                role="button"
                tabIndex={0}
                onClick={() => setInstrument(item)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') setInstrument(item);
                }}
                className={cn(
                  'group flex shrink-0 cursor-pointer items-center gap-1.5 border-b border-border/40 px-2 py-1.5 transition-colors hover:bg-accent/50',
                  activeInstrument && 'bg-primary/10',
                )}
              >
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    toggle(item);
                  }}
                  className="shrink-0 text-muted-foreground hover:text-foreground"
                  aria-label="Убрать из списка"
                >
                  <Star className="h-3 w-3 fill-current text-warning" />
                </button>

                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-1">
                    <span className="tnum truncate text-[11px] font-semibold">{item.ticker}</span>
                    {price !== undefined && (
                      <span className="tnum ml-auto text-[11px] font-medium">
                        {formatPrice(price, precisionForPrice(price))}
                      </span>
                    )}
                  </div>
                  <div className="truncate text-[10px] text-muted-foreground">{item.name}</div>
                </div>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="h-6 w-6 shrink-0 opacity-0 group-hover:opacity-100 data-[state=open]:opacity-100"
                      aria-label="Действия"
                      onClick={(event) => event.stopPropagation()}
                    >
                      <MoreHorizontal className="h-3.5 w-3.5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-52">
                    <DropdownMenuLabel>{item.ticker}</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem disabled={index === 0} onSelect={() => reorder(id, -1)}>
                      <ChevronUp className="mr-2 h-3.5 w-3.5" /> Выше
                    </DropdownMenuItem>
                    <DropdownMenuItem disabled={index === ids.length - 1} onSelect={() => reorder(id, 1)}>
                      <ChevronDown className="mr-2 h-3.5 w-3.5" /> Ниже
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger>
                        <Plus className="mr-2 h-3.5 w-3.5" /> Переместить в
                      </DropdownMenuSubTrigger>
                      <DropdownMenuSubContent>
                        {groups
                          .filter((group) => group.id !== activeGroupId)
                          .map((group) => (
                            <DropdownMenuItem
                              key={group.id}
                              onSelect={() => useWatchlistStore.getState().moveToGroup(id, group.id)}
                            >
                              {group.name}
                            </DropdownMenuItem>
                          ))}
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="text-destructive"
                      onSelect={() => useWatchlistStore.getState().remove(id, activeGroupId)}
                    >
                      <X className="mr-2 h-3.5 w-3.5" /> Убрать
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
}

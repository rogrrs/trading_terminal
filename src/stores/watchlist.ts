import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Instrument } from '@/features/api/types';
import { uid } from '@/lib/utils';

export interface WatchGroup {
  id: string;
  name: string;
  /** Instrument ids in display order. */
  items: string[];
}

interface WatchlistState {
  groups: WatchGroup[];
  /** Instrument snapshots so the list renders without a search. */
  instruments: Record<string, Instrument>;
  activeGroupId: string;
  toggle: (instrument: Instrument) => void;
  has: (id: string) => boolean;
  add: (instrument: Instrument, groupId?: string) => void;
  remove: (id: string, groupId?: string) => void;
  moveToGroup: (id: string, groupId: string) => void;
  createGroup: (name: string) => string;
  renameGroup: (id: string, name: string) => void;
  deleteGroup: (id: string) => void;
  setActiveGroup: (id: string) => void;
  reorder: (id: string, direction: -1 | 1) => void;
}

const FAVORITES = 'favorites';

function withInstrument(
  instruments: Record<string, Instrument>,
  instrument: Instrument,
): Record<string, Instrument> {
  return { ...instruments, [instrument.id]: instrument };
}

export const useWatchlistStore = create<WatchlistState>()(
  persist(
    (set, get) => ({
      groups: [{ id: FAVORITES, name: 'Избранное', items: [] }],
      instruments: {},
      activeGroupId: FAVORITES,

      toggle: (instrument) => {
        if (get().has(instrument.id)) {
          get().remove(instrument.id);
          return;
        }
        get().add(instrument);
      },

      has: (id) => get().groups.some((group) => group.items.includes(id)),

      add: (instrument, groupId) => {
        const target = groupId ?? get().activeGroupId;
        const instruments = withInstrument(get().instruments, instrument);
        set((state) => {
          const groups = state.groups.map((group) =>
            group.id === target
              ? { ...group, items: group.items.includes(instrument.id) ? group.items : [...group.items, instrument.id] }
              : group,
          );
          return {
            groups: groups.some((group) => group.id === target)
              ? groups
              : [...groups, { id: target, name: target === FAVORITES ? 'Избранное' : target, items: [instrument.id] }],
            instruments,
            activeGroupId: target,
          };
        });
      },

      remove: (id) =>
        set((state) => ({
          groups: state.groups.map((group) => ({
            ...group,
            items: group.items.filter((item) => item !== id),
          })),
        })),

      moveToGroup: (id, groupId) =>
        set((state) => ({
          groups: state.groups.map((group) => {
            const without = group.items.filter((item) => item !== id);
            return group.id === groupId ? { ...group, items: [...without, id] } : { ...group, items: without };
          }),
          activeGroupId: groupId,
        })),

      createGroup: (name) => {
        const id = uid('grp');
        set((state) => ({
          groups: [...state.groups, { id, name: name.trim() || 'Новый список', items: [] }],
          activeGroupId: id,
        }));
        return id;
      },

      renameGroup: (id, name) =>
        set((state) => ({
          groups: state.groups.map((group) => (group.id === id ? { ...group, name: name.trim() || group.name } : group)),
        })),

      deleteGroup: (id) =>
        set((state) => {
          if (id === FAVORITES) return state;
          const groups = state.groups.filter((group) => group.id !== id);
          return { groups, activeGroupId: state.activeGroupId === id ? FAVORITES : state.activeGroupId };
        }),

      setActiveGroup: (activeGroupId) => set({ activeGroupId }),

      reorder: (id, direction) =>
        set((state) => ({
          groups: state.groups.map((group) => {
            if (!group.items.includes(id)) return group;
            const items = [...group.items];
            const index = items.indexOf(id);
            const next = index + direction;
            if (next < 0 || next >= items.length) return group;
            [items[index], items[next]] = [items[next], items[index]];
            return { ...group, items };
          }),
        })),
    }),
    {
      name: 'tt.watchlist.v1',
      version: 1,
      partialize: (state): Pick<WatchlistState, 'groups' | 'instruments' | 'activeGroupId'> => ({
        groups: state.groups,
        instruments: state.instruments,
        activeGroupId: state.activeGroupId,
      }),
    },
  ),
);

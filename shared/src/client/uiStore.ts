// shared/src/client/uiStore.ts — Common UI state store
import { create } from 'zustand';

interface UiState {
  sidebarOpen: boolean;
  currentUserId: string | null;
  setSidebarOpen: (open: boolean) => void;
  toggleSidebar: () => void;
  setCurrentUserId: (userId: string | null) => void;
}

const STORAGE_KEY = 'gmo_onair_sidebar_open';

function getInitialSidebarOpen(): boolean {
  if (typeof window === 'undefined') return false;
  const isDesktop = window.innerWidth >= 1024;
  if (!isDesktop) return false;
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    if (v === 'true') return true;
    if (v === 'false') return false;
  } catch {
    // ignore
  }
  return true;
}

function persist(open: boolean) {
  if (typeof window === 'undefined') return;
  const isDesktop = window.innerWidth >= 1024;
  if (!isDesktop) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, open ? 'true' : 'false');
  } catch {
    // ignore
  }
}

export const useUiStore = create<UiState>((set) => ({
  sidebarOpen: getInitialSidebarOpen(),
  currentUserId: null,
  setSidebarOpen: (open) => {
    persist(open);
    set({ sidebarOpen: open });
  },
  toggleSidebar: () =>
    set((state) => {
      const next = !state.sidebarOpen;
      persist(next);
      return { sidebarOpen: next };
    }),
  setCurrentUserId: (userId) => set({ currentUserId: userId }),
}));

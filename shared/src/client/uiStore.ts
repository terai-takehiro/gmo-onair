// shared/src/client/uiStore.ts — Common UI state store
import { create } from 'zustand';

export interface UiState {
  sidebarOpen: boolean;
  currentUserId: string | null;
  setSidebarOpen: (open: boolean) => void;
  toggleSidebar: () => void;
  setCurrentUserId: (userId: string | null) => void;
}

// Mobile (< 1024px): sidebar closed by default
const isDesktop = typeof window !== 'undefined' && window.innerWidth >= 1024;

export const useUiStore = create<UiState>((set) => ({
  sidebarOpen: isDesktop,
  currentUserId: null,
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  setCurrentUserId: (userId) => set({ currentUserId: userId }),
}));

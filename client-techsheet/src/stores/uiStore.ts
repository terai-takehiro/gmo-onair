import { create } from 'zustand';

interface UiState {
  sidebarOpen: boolean;
  currentUserId: string | null;
  setSidebarOpen: (open: boolean) => void;
  toggleSidebar: () => void;
  setCurrentUserId: (userId: string | null) => void;
}

export const useUiStore = create<UiState>((set) => ({
  sidebarOpen: true,
  currentUserId: null,
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  setCurrentUserId: (userId) => set({ currentUserId: userId }),
}));

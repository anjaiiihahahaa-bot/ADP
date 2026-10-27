import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface User {
  id: string;
  username: string;
  email: string;
  role: 'super_admin' | 'admin' | 'operator' | 'user';
  totp_enabled: boolean;
}

interface AppState {
  user: User | null;
  theme: 'dark' | 'light';
  sidebarOpen: boolean;
  setUser: (user: User | null) => void;
  setTheme: (theme: 'dark' | 'light') => void;
  toggleTheme: () => void;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
}

export const useStore = create<AppState>()(
  persist(
    (set) => ({
      user: null,
      theme: 'dark',
      sidebarOpen: true,
      setUser: (user) => set({ user }),
      setTheme: (theme) => set({ theme }),
      toggleTheme: () => set((s) => ({ theme: s.theme === 'dark' ? 'light' : 'dark' })),
      toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
      setSidebarOpen: (open) => set({ sidebarOpen: open }),
    }),
    { name: 'adp-store', partialize: (s) => ({ theme: s.theme }) }
  )
);

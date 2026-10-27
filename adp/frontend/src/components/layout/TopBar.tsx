import React from 'react';
import { Menu, Sun, Moon, Bell } from 'lucide-react';
import { useStore } from '../../lib/store';

interface Props { title: string; }

export default function TopBar({ title }: Props) {
  const { toggleSidebar, theme, toggleTheme } = useStore();

  return (
    <header className="flex items-center gap-3 px-4 h-14 border-b border-[var(--border)] bg-[var(--surface)] sticky top-0 z-10">
      <button
        onClick={toggleSidebar}
        className="lg:hidden p-2 rounded-md text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--surface-2)]"
      >
        <Menu size={18} />
      </button>

      <h1 className="font-semibold text-sm text-[var(--text)] flex-1 truncate">{title}</h1>

      <button
        onClick={toggleTheme}
        className="p-2 rounded-md text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--surface-2)]"
        title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
      >
        {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
      </button>
    </header>
  );
}

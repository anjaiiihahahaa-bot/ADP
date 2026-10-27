import React, { useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import TopBar from './TopBar';
import { useStore } from '../../lib/store';

const TITLES: Record<string, string> = {
  '/': 'Dashboard',
  '/servers': 'Server Manager',
  '/files': 'File Manager',
  '/editor': 'Code Editor',
  '/terminal': 'Terminal',
  '/databases': 'Database Manager',
  '/users': 'User Management',
  '/tokens': 'API Tokens',
  '/monitoring': 'Monitoring',
  '/audit': 'Audit Logs',
  '/settings': 'Settings',
};

export default function AppLayout() {
  const { theme } = useStore();
  const location = useLocation();
  const title = TITLES[location.pathname] || 'ADP';

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  return (
    <div className="flex h-screen overflow-hidden bg-[var(--bg)]">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <TopBar title={title} />
        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

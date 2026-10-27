import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, Server, FolderOpen, Code2, Terminal,
  Database, Users, Key, Activity, Settings, Shield,
  ChevronLeft, Menu, LogOut, Skull,
} from 'lucide-react';
import { useStore } from '../../lib/store';
import { authApi } from '../../lib/api';
import clsx from 'clsx';

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard', exact: true },
  { to: '/servers', icon: Server, label: 'Servers' },
  { to: '/files', icon: FolderOpen, label: 'Files' },
  { to: '/editor', icon: Code2, label: 'Editor' },
  { to: '/terminal', icon: Terminal, label: 'Terminal' },
  { to: '/databases', icon: Database, label: 'Databases' },
  { to: '/users', icon: Users, label: 'Users', adminOnly: true },
  { to: '/tokens', icon: Key, label: 'API Tokens' },
  { to: '/monitoring', icon: Activity, label: 'Monitoring' },
  { to: '/audit', icon: Shield, label: 'Audit Logs', adminOnly: true },
  { to: '/settings', icon: Settings, label: 'Settings' },
];

export default function Sidebar() {
  const { sidebarOpen, toggleSidebar, setSidebarOpen, user, setUser } = useStore();
  const location = useLocation();

  const handleLogout = async () => {
    await authApi.logout().catch(() => {});
    setUser(null);
  };

  const isAdmin = user && ['super_admin', 'admin'].includes(user.role);

  return (
    <>
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-20 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        className={clsx(
          'fixed lg:static inset-y-0 left-0 z-30 flex flex-col',
          'bg-[var(--surface)] border-r border-[var(--border)]',
          'transition-[width] duration-200 ease-in-out',
          sidebarOpen ? 'w-56' : 'w-14'
        )}
      >
        {/* Logo */}
        <div className="flex items-center gap-3 px-3 py-4 border-b border-[var(--border)]">
          <div className="w-8 h-8 bg-accent-500 rounded-lg flex items-center justify-center flex-shrink-0">
            <Skull size={16} className="text-white" />
          </div>
          {sidebarOpen && (
            <span className="font-bold text-sm tracking-widest text-accent-400">ADP</span>
          )}
          <button
            onClick={toggleSidebar}
            className="ml-auto text-[var(--text-muted)] hover:text-[var(--text)] p-1 rounded"
          >
            {sidebarOpen ? <ChevronLeft size={16} /> : <Menu size={16} />}
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-2 px-1.5 space-y-0.5">
          {navItems.map((item) => {
            if (item.adminOnly && !isAdmin) return null;
            const active = item.exact
              ? location.pathname === item.to
              : location.pathname.startsWith(item.to);
            return (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={() => window.innerWidth < 1024 && setSidebarOpen(false)}
                className={clsx(
                  'flex items-center gap-3 px-2.5 py-2 rounded-md text-sm font-medium transition-all',
                  active
                    ? 'bg-accent-500/15 text-accent-400'
                    : 'text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--surface-2)]'
                )}
                title={!sidebarOpen ? item.label : undefined}
              >
                <item.icon size={17} className="flex-shrink-0" />
                {sidebarOpen && <span className="truncate">{item.label}</span>}
                {active && sidebarOpen && (
                  <span className="ml-auto w-1.5 h-1.5 bg-accent-400 rounded-full" />
                )}
              </NavLink>
            );
          })}
        </nav>

        {/* User */}
        <div className="border-t border-[var(--border)] p-2">
          {sidebarOpen && user && (
            <div className="px-2 pb-2">
              <p className="text-xs font-medium text-[var(--text)] truncate">{user.username}</p>
              <p className="text-xs text-[var(--text-muted)] capitalize">{user.role.replace('_', ' ')}</p>
            </div>
          )}
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 w-full px-2.5 py-2 rounded-md text-sm text-[var(--text-muted)] hover:text-danger hover:bg-danger/10 transition-all"
            title={!sidebarOpen ? 'Logout' : undefined}
          >
            <LogOut size={17} className="flex-shrink-0" />
            {sidebarOpen && <span>Logout</span>}
          </button>
        </div>
      </aside>
    </>
  );
}

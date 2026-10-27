import React, { useEffect } from 'react';
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { useStore } from './lib/store';
import { authApi } from './lib/api';
import AppLayout from './components/layout/AppLayout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Servers from './pages/Servers';
import FileManager from './pages/FileManager';
import Editor from './pages/Editor';
import Terminal from './pages/Terminal';
import Databases from './pages/Databases';
import Users from './pages/Users';
import Monitoring from './pages/Monitoring';
import ApiTokens from './pages/ApiTokens';
import AuditLogs from './pages/AuditLogs';
import Settings from './pages/Settings';

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user } = useStore();
  const location = useLocation();
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;
  return <>{children}</>;
}

function RequireRole({ children, roles }: { children: React.ReactNode; roles: string[] }) {
  const { user } = useStore();
  if (!user || !roles.includes(user.role)) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function AuthLoader({ children }: { children: React.ReactNode }) {
  const { setUser } = useStore();
  const [checked, setChecked] = React.useState(false);

  useEffect(() => {
    authApi.me().then((r) => setUser(r.data)).catch(() => setUser(null)).finally(() => setChecked(true));
  }, []);

  if (!checked) {
    return (
      <div className="h-screen flex items-center justify-center bg-[var(--bg)]">
        <div className="w-8 h-8 border-2 border-accent-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return <>{children}</>;
}

export default function App() {
  return (
    <AuthLoader>
      <Routes>
        <Route path="/login" element={<Login />} />

        <Route path="/" element={<RequireAuth><AppLayout /></RequireAuth>}>
          <Route index element={<Dashboard />} />
          <Route path="servers" element={<Servers />} />
          <Route path="files" element={<FileManager />} />
          <Route path="editor" element={<Editor />} />
          <Route path="terminal" element={<Terminal />} />
          <Route path="databases" element={<Databases />} />
          <Route path="monitoring" element={<Monitoring />} />
          <Route path="tokens" element={<ApiTokens />} />
          <Route path="settings" element={<Settings />} />

          {/* Admin-only routes */}
          <Route path="users" element={
            <RequireRole roles={['super_admin', 'admin']}>
              <Users />
            </RequireRole>
          } />
          <Route path="audit" element={
            <RequireRole roles={['super_admin', 'admin']}>
              <AuditLogs />
            </RequireRole>
          } />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthLoader>
  );
}

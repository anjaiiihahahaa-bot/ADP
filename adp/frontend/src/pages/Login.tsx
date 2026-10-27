import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Skull, Eye, EyeOff } from 'lucide-react';
import { authApi } from '../lib/api';
import { useStore } from '../lib/store';
import toast from 'react-hot-toast';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [showTotp, setShowTotp] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const { setUser } = useStore();
  const nav = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await authApi.login({ username, password, totp_code: totpCode || undefined });
      if (res.data.require_totp) {
        setShowTotp(true);
        setLoading(false);
        return;
      }
      setUser(res.data.user);
      nav('/');
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } }).response?.data?.error || 'Login failed';
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--bg)] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 bg-accent-500/10 border border-accent-500/30 rounded-2xl flex items-center justify-center mb-3">
            <Skull size={32} className="text-accent-400" />
          </div>
          <h1 className="text-2xl font-bold text-[var(--text)]">ADP</h1>
          <p className="text-sm text-[var(--text-muted)] mt-1">Admin Deployment Panel</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-6 space-y-4">
          <div>
            <label className="block text-xs font-medium text-[var(--text-muted)] mb-1.5">
              Username or Email
            </label>
            <input
              type="text"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-2.5 text-sm text-[var(--text)] focus:outline-none focus:border-accent-500 placeholder:text-[var(--text-muted)]"
              placeholder="admin"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[var(--text-muted)] mb-1.5">Password</label>
            <div className="relative">
              <input
                type={showPass ? 'text' : 'password'}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-2.5 pr-10 text-sm text-[var(--text)] focus:outline-none focus:border-accent-500"
                required
              />
              <button
                type="button"
                onClick={() => setShowPass(!showPass)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text)]"
              >
                {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>

          {showTotp && (
            <div>
              <label className="block text-xs font-medium text-[var(--text-muted)] mb-1.5">Authenticator Code</label>
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value)}
                className="w-full bg-[var(--surface-2)] border border-accent-500/50 rounded-lg px-3 py-2.5 text-sm text-[var(--text)] focus:outline-none focus:border-accent-500 tracking-widest text-center"
                placeholder="000000"
                autoFocus
              />
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-accent-500 hover:bg-accent-600 disabled:opacity-50 text-white font-medium py-2.5 rounded-lg text-sm transition-colors"
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <p className="text-center text-xs text-[var(--text-muted)] mt-4">
          ADP — Admin access only
        </p>
      </div>
    </div>
  );
}

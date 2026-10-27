import React, { useState } from 'react';
import { Moon, Sun, Shield, Key, LogOut, User } from 'lucide-react';
import { useStore } from '../lib/store';
import { authApi } from '../lib/api';
import Modal from '../components/ui/Modal';
import toast from 'react-hot-toast';
import QRCode from 'qrcode';

export default function Settings() {
  const { theme, setTheme, user } = useStore();
  const [totpSetup, setTotpSetup] = useState<{ secret: string; qr: string; otpauth: string } | null>(null);
  const [totpCode, setTotpCode] = useState('');
  const [showTotpSetup, setShowTotpSetup] = useState(false);
  const [disablingTotp, setDisablingTotp] = useState(false);
  const [sessions, setSessions] = useState<{ id: string; ip_address: string; created_at: string; user_agent?: string }[]>([]);
  const [showSessions, setShowSessions] = useState(false);
  const [pwForm, setPwForm] = useState({ current: '', next: '', confirm: '' });
  const [showPwChange, setShowPwChange] = useState(false);

  const startTotpSetup = async () => {
    try {
      const res = await authApi.setupTotp();
      const qr = await QRCode.toDataURL(res.data.otpauth);
      setTotpSetup({ ...res.data, qr });
      setShowTotpSetup(true);
    } catch { toast.error('Failed to start TOTP setup'); }
  };

  const verifyTotp = async () => {
    if (!totpCode || totpCode.length !== 6) { toast.error('Enter 6-digit code'); return; }
    try {
      await authApi.verifyTotp(totpCode);
      toast.success('Two-factor authentication enabled');
      setShowTotpSetup(false);
      setTotpSetup(null);
      setTotpCode('');
    } catch { toast.error('Invalid code'); }
  };

  const disableTotp = async () => {
    if (!confirm('Disable two-factor authentication?')) return;
    setDisablingTotp(true);
    try {
      await authApi.removeTotp();
      toast.success('2FA disabled');
    } catch { toast.error('Failed'); }
    finally { setDisablingTotp(false); }
  };

  const loadSessions = async () => {
    try {
      const res = await authApi.sessions();
      setSessions(res.data);
      setShowSessions(true);
    } catch { toast.error('Failed to load sessions'); }
  };

  const revokeSession = async (id: string) => {
    try {
      await authApi.revokeSession(id);
      setSessions((s) => s.filter((x) => x.id !== id));
      toast.success('Session revoked');
    } catch { toast.error('Failed'); }
  };

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pwForm.next !== pwForm.confirm) { toast.error('Passwords do not match'); return; }
    if (pwForm.next.length < 8) { toast.error('Min 8 characters'); return; }
    try {
      await authApi.changePassword(pwForm.current, pwForm.next);
      toast.success('Password changed');
      setShowPwChange(false);
      setPwForm({ current: '', next: '', confirm: '' });
    } catch (err: unknown) {
      toast.error((err as { response?: { data?: { error?: string } } }).response?.data?.error || 'Failed');
    }
  };

  return (
    <div className="p-4 md:p-6 max-w-xl space-y-4">
      {/* Appearance */}
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--border)]">
          <h3 className="text-sm font-semibold">Appearance</h3>
        </div>
        <div className="p-4 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm">
            {theme === 'dark' ? <Moon size={16} className="text-accent-400" /> : <Sun size={16} className="text-amber-400" />}
            Theme
          </div>
          <div className="flex bg-[var(--surface-2)] border border-[var(--border)] rounded-lg overflow-hidden">
            <button onClick={() => setTheme('dark')}
              className={`px-3 py-1.5 text-xs font-medium ${theme === 'dark' ? 'bg-accent-500 text-white' : 'text-[var(--text-muted)] hover:bg-[var(--surface)]'}`}>
              Dark
            </button>
            <button onClick={() => setTheme('light')}
              className={`px-3 py-1.5 text-xs font-medium ${theme === 'light' ? 'bg-accent-500 text-white' : 'text-[var(--text-muted)] hover:bg-[var(--surface)]'}`}>
              Light
            </button>
          </div>
        </div>
      </div>

      {/* Account */}
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--border)]">
          <h3 className="text-sm font-semibold">Account</h3>
        </div>
        <div className="divide-y divide-[var(--border)]">
          <div className="flex items-center gap-3 px-4 py-3">
            <User size={16} className="text-[var(--text-muted)]" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">{user?.username}</p>
              <p className="text-xs text-[var(--text-muted)]">{user?.email} · {user?.role}</p>
            </div>
          </div>

          <button onClick={() => setShowPwChange(true)}
            className="flex items-center gap-3 px-4 py-3 w-full hover:bg-[var(--surface-2)] text-left">
            <Key size={16} className="text-[var(--text-muted)]" />
            <span className="text-sm">Change password</span>
          </button>

          <button onClick={loadSessions}
            className="flex items-center gap-3 px-4 py-3 w-full hover:bg-[var(--surface-2)] text-left">
            <LogOut size={16} className="text-[var(--text-muted)]" />
            <span className="text-sm">Active sessions</span>
          </button>
        </div>
      </div>

      {/* 2FA */}
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--border)]">
          <h3 className="text-sm font-semibold">Two-Factor Authentication</h3>
        </div>
        <div className="p-4">
          {user?.totp_enabled ? (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Shield size={16} className="text-emerald-400" />
                <span className="text-sm text-emerald-400">2FA enabled</span>
              </div>
              <button onClick={disableTotp} disabled={disablingTotp}
                className="text-xs text-red-400 hover:underline disabled:opacity-50">
                Disable
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Shield size={16} className="text-[var(--text-muted)]" />
                <span className="text-sm text-[var(--text-muted)]">2FA not enabled</span>
              </div>
              <button onClick={startTotpSetup}
                className="text-xs bg-accent-500 hover:bg-accent-600 text-white px-3 py-1.5 rounded-lg">
                Enable 2FA
              </button>
            </div>
          )}
        </div>
      </div>

      {/* TOTP setup modal */}
      <Modal open={showTotpSetup} onClose={() => setShowTotpSetup(false)} title="Enable Two-Factor Auth" size="sm">
        <p className="text-sm text-[var(--text-muted)] mb-4">
          Scan this QR code with your authenticator app (Google Authenticator, Authy, etc.)
        </p>
        {totpSetup && (
          <div className="flex flex-col items-center gap-4">
            <img src={totpSetup.qr} alt="TOTP QR" className="rounded-xl border border-[var(--border)]" />
            <div className="w-full bg-[var(--surface-2)] rounded-lg px-3 py-2 font-mono text-xs break-all text-center">
              {totpSetup.secret}
            </div>
          </div>
        )}
        <input
          type="text" maxLength={6} pattern="[0-9]{6}" inputMode="numeric"
          value={totpCode} onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ''))}
          className="input w-full mt-4 text-center tracking-widest font-mono text-lg"
          placeholder="000000"
        />
        <div className="flex gap-2 mt-4 justify-end">
          <button onClick={() => setShowTotpSetup(false)} className="btn-ghost">Cancel</button>
          <button onClick={verifyTotp} className="btn-primary">Verify & Enable</button>
        </div>
      </Modal>

      {/* Sessions modal */}
      <Modal open={showSessions} onClose={() => setShowSessions(false)} title="Active Sessions">
        <div className="space-y-2">
          {sessions.map((s) => (
            <div key={s.id} className="flex items-center justify-between bg-[var(--surface-2)] rounded-lg px-3 py-2">
              <div>
                <p className="text-xs font-medium">{s.ip_address || 'Unknown IP'}</p>
                <p className="text-xs text-[var(--text-muted)]">{new Date(s.created_at).toLocaleString()}</p>
              </div>
              <button onClick={() => revokeSession(s.id)} className="text-xs text-red-400 hover:underline">Revoke</button>
            </div>
          ))}
        </div>
      </Modal>

      {/* Change password modal */}
      <Modal open={showPwChange} onClose={() => setShowPwChange(false)} title="Change Password" size="sm">
        <form onSubmit={changePassword} className="space-y-4">
          <div><label className="label">Current password</label>
            <input required type="password" value={pwForm.current} onChange={(e) => setPwForm({ ...pwForm, current: e.target.value })} className="input w-full" /></div>
          <div><label className="label">New password</label>
            <input required type="password" minLength={8} value={pwForm.next} onChange={(e) => setPwForm({ ...pwForm, next: e.target.value })} className="input w-full" /></div>
          <div><label className="label">Confirm new password</label>
            <input required type="password" minLength={8} value={pwForm.confirm} onChange={(e) => setPwForm({ ...pwForm, confirm: e.target.value })} className="input w-full" /></div>
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={() => setShowPwChange(false)} className="btn-ghost">Cancel</button>
            <button type="submit" className="btn-primary">Change</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

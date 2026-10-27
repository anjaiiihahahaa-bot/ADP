import React from 'react';
import Modal from './Modal';
import { AlertTriangle } from 'lucide-react';

interface Props {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  loading?: boolean;
}

export default function ConfirmDialog({
  open, onClose, onConfirm, title, message, confirmLabel = 'Confirm', danger = false, loading
}: Props) {
  return (
    <Modal open={open} onClose={onClose} title={title} size="sm">
      <div className="flex gap-3 mb-4">
        <AlertTriangle size={20} className={danger ? 'text-red-400 flex-shrink-0 mt-0.5' : 'text-amber-400 flex-shrink-0 mt-0.5'} />
        <p className="text-sm text-[var(--text-muted)]">{message}</p>
      </div>
      <div className="flex gap-2 justify-end">
        <button
          onClick={onClose}
          className="px-3 py-1.5 text-sm rounded-lg bg-[var(--surface-2)] hover:bg-[var(--surface-3)] text-[var(--text-muted)]"
        >
          Cancel
        </button>
        <button
          onClick={onConfirm}
          disabled={loading}
          className={`px-3 py-1.5 text-sm rounded-lg font-medium disabled:opacity-50 ${
            danger ? 'bg-red-500 hover:bg-red-600 text-white' : 'bg-accent-500 hover:bg-accent-600 text-white'
          }`}
        >
          {loading ? 'Processing...' : confirmLabel}
        </button>
      </div>
    </Modal>
  );
}

/**
 * @file ConfirmDialog.tsx
 * @module components
 *
 * Diálogo de confirmación controlado (Escape + focus en confirm).
 * Textos visibles traducidos con `useI18n()` (F4.6c): el caller pasa
 * `title`/`message`/`confirmLabel` ya traducidos; Cancel y el default
 * de confirm salen de `common` (`buttons.*`).
 */

import { useEffect, useRef } from 'react';
import { useI18n } from '../i18n';

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDialog({
  isOpen,
  title,
  message,
  confirmLabel,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const { t } = useI18n();
  const confirmText = confirmLabel ?? t('buttons.confirm');
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => confirmRef.current?.focus(), 100);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [isOpen, onCancel]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/60 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label={title}>
      <div className="bg-surface-container-lowest rounded-xl shadow-2xl border border-outline-variant/30 w-full max-w-sm mx-4 p-6">
        <h2 className="font-headline-sm text-headline-sm text-on-surface mb-2">{title}</h2>
        <p className="font-body-sm text-body-sm text-on-surface-variant mb-6">{message}</p>
        <div className="flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="py-2 px-4 rounded font-title-sm text-title-sm text-on-surface-variant hover:bg-surface-container transition-colors"
          >
            {t('buttons.cancel')}
          </button>
          <button
            ref={confirmRef}
            onClick={onConfirm}
            className="py-2 px-4 rounded font-title-sm text-title-sm bg-error text-on-error hover:bg-error/80 transition-colors"
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}

'use client';

import { useEffect } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from './ui';

export default function ConfirmDialog({ confirmation, onCancel }) {
  useEffect(() => {
    if (!confirmation) return;
    const escape = (event) => {
      if (event.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, [confirmation, onCancel]);

  if (!confirmation) return null;
  return (
    <div className="confirm-backdrop" role="presentation" onMouseDown={onCancel}>
      <section
        className="confirm-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-message"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="confirm-icon">
          <AlertTriangle size={21} />
        </div>
        <div className="confirm-copy">
          <h2 id="confirm-title">{confirmation.title}</h2>
          <p id="confirm-message">{confirmation.message}</p>
        </div>
        <div className="confirm-actions">
          <Button autoFocus variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="danger" onClick={confirmation.onConfirm}>
            {confirmation.confirmLabel || 'Continue'}
          </Button>
        </div>
      </section>
    </div>
  );
}

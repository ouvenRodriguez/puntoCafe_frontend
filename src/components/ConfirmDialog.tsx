interface ConfirmDialogProps {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  busyLabel?: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  title,
  message,
  confirmLabel = 'Eliminar',
  cancelLabel = 'Cancelar',
  busyLabel = 'Eliminando…',
  danger = true,
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <div className="modal-backdrop" onMouseDown={busy ? undefined : onCancel}>
      <div
        className="modal modal-confirm"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-message"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="confirm-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24">
            <path d="M12 8v5" />
            <circle cx="12" cy="16" r="0.9" fill="currentColor" stroke="none" />
            <circle cx="12" cy="12" r="8.2" />
          </svg>
        </div>
        <h2 id="confirm-title">{title}</h2>
        <p id="confirm-message" className="confirm-copy">
          {message}
        </p>
        <div className="modal-actions">
          <div className="card-actions">
            <button className="button button-quiet" type="button" disabled={busy} onClick={onCancel}>
              {cancelLabel}
            </button>
            <button
              className={danger ? 'button button-danger' : 'button'}
              type="button"
              disabled={busy}
              onClick={onConfirm}
            >
              {busy ? busyLabel : confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

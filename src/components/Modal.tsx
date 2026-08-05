"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";

// Native <dialog> — same "prefer real elements over hand-rolled ARIA"
// posture as MobileNavMenu's <details>/<summary> (ACCESSIBILITY.md).
// showModal()/close() give a working focus trap, Escape-to-close, and
// focus-return-to-trigger for free, without reimplementing any of that in
// JS. COMPONENT_LIBRARY.md flags this as the component the first
// destructive-action confirmation flow (UX_GUIDELINES.md #9) blocks on.
export function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      className="modal"
      aria-labelledby={titleId}
      // "close" fires for every dismissal path (Escape, backdrop click via
      // the handler below, the confirm/cancel buttons calling close()) —
      // a single spot to sync the open prop back down, rather than wiring
      // onClose into each dismissal path separately.
      onClose={onClose}
      onClick={(event) => {
        // <dialog> has no separate backdrop element — a click that lands on
        // the dialog's own padding box (outside .modalBody) is a backdrop
        // click; anything that bubbled up from inside .modalBody is not.
        if (event.target === dialogRef.current) {
          dialogRef.current?.close();
        }
      }}
    >
      <div className="modalBody">
        <h2 id={titleId} className="modalTitle">
          {title}
        </h2>
        {children}
      </div>
    </dialog>
  );
}

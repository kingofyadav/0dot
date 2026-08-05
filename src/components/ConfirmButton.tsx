"use client";

import { useRef, useState, type ButtonHTMLAttributes } from "react";
import { Modal } from "./Modal";

// Drop-in replacement for a plain `<button type="submit">` inside an
// existing destructive-action <form action={...}>` — opens a confirmation
// dialog that states the consequence instead of submitting immediately
// (UX_GUIDELINES.md #9: "the confirmation UI explains the consequence, not
// just 'are you sure?'"). Confirming calls requestSubmit() on the enclosing
// form, so the Server Action + revalidatePath wiring already on that form
// is untouched — this only interposes a confirmation step in front of it.
export function ConfirmButton({
  title,
  description,
  confirmLabel = "Delete",
  className,
  children,
  ...buttonProps
}: {
  title: string;
  description: string;
  confirmLabel?: string;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  return (
    <>
      <button {...buttonProps} ref={buttonRef} type="button" className={className} onClick={() => setOpen(true)}>
        {children}
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title={title}>
        <p>{description}</p>
        <div className="modalActions">
          <button type="button" className="button buttonSecondary" onClick={() => setOpen(false)}>
            Cancel
          </button>
          <button
            type="button"
            className="button buttonDanger"
            onClick={() => {
              setOpen(false);
              buttonRef.current?.form?.requestSubmit();
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </Modal>
    </>
  );
}

"use client";

import { useRef, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Trash2, X } from "lucide-react";
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
  // Defaults to the trash icon regardless of confirmLabel's text — every
  // caller here is already a destructive action per this component's own
  // contract, so gating the icon on an exact `confirmLabel === "Delete"`
  // string match (the old behavior) silently dropped it for any other
  // destructive copy ("Remove", "Clear all", "End fundraiser", ...). Pass
  // `icon={null}` to opt a specific caller out.
  icon = <Trash2 size={16} aria-hidden="true" />,
  className,
  children,
  ...buttonProps
}: {
  title: string;
  description: string;
  confirmLabel?: string;
  icon?: ReactNode | null;
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
            <X size={16} aria-hidden="true" />
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
            {icon}
            {confirmLabel}
          </button>
        </div>
      </Modal>
    </>
  );
}

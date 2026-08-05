"use client";

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";

type Toast = { id: number; message: string };

const ToastContext = createContext<((message: string) => void) | null>(null);

// Lightweight non-blocking feedback, complementing the existing
// revalidatePath-driven full-rerender pattern (COMPONENT_LIBRARY.md:
// "doesn't scale to lightweight confirmations" like "Link added",
// "Copied to clipboard"). Mounted once at the root (see layout.tsx) so any
// client component can call useToast() without its own provider wiring.
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);

  const showToast = useCallback((message: string) => {
    const id = nextId.current++;
    setToasts((current) => [...current, { id, message }]);
    setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, 4000);
  }, []);

  return (
    <ToastContext.Provider value={showToast}>
      {children}
      {/* aria-live region: screen readers announce new toasts as they
          mount, without needing focus to move (ACCESSIBILITY.md's flagged
          gap — "no live-region announcements for async updates"). */}
      <div className="toastStack" role="status" aria-live="polite">
        {toasts.map((toast) => (
          <div key={toast.id} className="toast">
            {toast.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const showToast = useContext(ToastContext);
  if (!showToast) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return showToast;
}

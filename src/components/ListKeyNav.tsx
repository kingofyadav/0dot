"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { useKeyboardShortcuts } from "@/components/KeyboardShortcutProvider";
import { isTypingTarget } from "@/lib/keyboard-shortcuts";

const SELECTED_CLASS = "navSelected";

// Twitter/Gmail-style j/k list navigation, generic over whatever it wraps —
// a row just needs `data-nav-item` (the wrapper), `data-nav-open` (the
// element Enter/O activates — can be the row itself, e.g. a <Link>), and
// optionally `data-nav-like` / `data-nav-reply` (only queried when
// supportsLike/supportsReply is set). This keeps Feed/Messages/Notifications
// list markup untouched beyond a few data attributes rather than teaching
// each of them their own selection state.
export function ListKeyNav({
  children,
  helpTitle,
  supportsLike = false,
  supportsReply = false,
}: {
  children: ReactNode;
  helpTitle: string;
  supportsLike?: boolean;
  supportsReply?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const indexRef = useRef(-1);
  const { setListNavGroup } = useKeyboardShortcuts();

  // Registers this page's list-nav row set with ShortcutsHelp for as long
  // as this component is mounted, and clears it on the way out — only one
  // ListKeyNav is ever on screen at a time, so there's nothing to merge.
  useEffect(() => {
    const items: { keys: string; label: string }[] = [
      { keys: "J", label: "Next item" },
      { keys: "K", label: "Previous item" },
      { keys: "Enter", label: "Open selected" },
    ];
    if (supportsLike) items.push({ keys: "L", label: "Like selected post" });
    if (supportsReply) items.push({ keys: "R", label: "Reply to selected post" });
    setListNavGroup({ title: helpTitle, items });
    return () => setListNavGroup(null);
  }, [helpTitle, supportsLike, supportsReply, setListNavGroup]);

  useEffect(() => {
    function getRows(): HTMLElement[] {
      return Array.from(containerRef.current?.querySelectorAll<HTMLElement>("[data-nav-item]") ?? []);
    }

    function currentRow(): HTMLElement | null {
      const rows = getRows();
      return indexRef.current >= 0 ? (rows[indexRef.current] ?? null) : null;
    }

    function select(nextIndex: number) {
      const rows = getRows();
      if (rows.length === 0) return;
      const clamped = Math.max(0, Math.min(nextIndex, rows.length - 1));
      rows.forEach((row, index) => row.classList.toggle(SELECTED_CLASS, index === clamped));
      rows[clamped].scrollIntoView({ block: "nearest" });
      indexRef.current = clamped;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (isTypingTarget(event.target) || event.metaKey || event.ctrlKey || event.altKey) return;
      const key = event.key.toLowerCase();

      if (key === "j" || event.key === "ArrowDown") {
        event.preventDefault();
        select(indexRef.current + 1);
        return;
      }
      if (key === "k" || event.key === "ArrowUp") {
        event.preventDefault();
        select(indexRef.current - 1);
        return;
      }
      if (key === "enter" || key === "o") {
        const row = currentRow();
        if (!row) return;
        const openTarget = row.matches("[data-nav-open]") ? row : row.querySelector<HTMLElement>("[data-nav-open]");
        if (!openTarget) return;
        event.preventDefault();
        openTarget.click();
        return;
      }
      if (supportsLike && key === "l") {
        const likeButton = currentRow()?.querySelector<HTMLElement>("[data-nav-like]");
        if (!likeButton) return;
        event.preventDefault();
        likeButton.click();
        return;
      }
      if (supportsReply && key === "r") {
        const replyToggle = currentRow()?.querySelector<HTMLElement>("[data-nav-reply]");
        if (!replyToggle) return;
        event.preventDefault();
        replyToggle.click();
        return;
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [supportsLike, supportsReply]);

  return (
    <div ref={containerRef} data-nav-container="true">
      {children}
    </div>
  );
}

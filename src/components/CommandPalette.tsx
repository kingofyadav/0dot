"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Bell,
  Bookmark,
  Briefcase,
  Building2,
  Flame,
  Home,
  Keyboard,
  MessageCircle,
  MessagesSquare,
  Moon,
  PlusCircle,
  Search,
  Settings as SettingsIcon,
  Sun,
  User,
  Users,
  type LucideIcon,
} from "lucide-react";
import { fuzzyMatch } from "@/lib/keyboard-shortcuts";
import { getEffectiveTheme, persistTheme } from "@/lib/browser-tab";
import { useBrowserTab } from "@/components/BrowserTabProvider";
import { settingsNavGroups } from "@/lib/settings-nav";

type CommandItem = {
  id: string;
  label: string;
  group: string;
  hint?: string;
  icon: LucideIcon;
  run: () => void;
};

const MAX_RESULTS = 20;

// Cmd/Ctrl+K overlay — Superhuman/Linear-style: jump to any top-level
// destination or run a quick action without leaving the keyboard. Built on
// the same native <dialog> mechanics as Modal.tsx (focus trap/Escape/
// backdrop-click for free), but with its own layout (search input + result
// list) rather than reusing Modal's title-bar shape.
export function CommandPalette({
  open,
  onClose,
  onOpenHelp,
  profileHandle,
}: {
  open: boolean;
  onClose: () => void;
  onOpenHelp: () => void;
  profileHandle: string | null;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      className="commandPalette"
      aria-label="Command palette"
      onClose={onClose}
      onClick={(event) => {
        // Same "click landed on the dialog's own padding box" backdrop
        // detection as Modal.tsx — <dialog> has no separate backdrop node.
        if (event.target === dialogRef.current) dialogRef.current?.close();
      }}
    >
      {/* Mounted fresh every time the palette opens (rather than kept alive
          with an effect that resets query/activeIndex on `open` flipping) —
          a fresh mount gives clean initial state for free, no
          setState-in-effect needed. */}
      {open && (
        <CommandPaletteContent
          onRequestClose={() => dialogRef.current?.close()}
          onOpenHelp={onOpenHelp}
          profileHandle={profileHandle}
        />
      )}
    </dialog>
  );
}

function CommandPaletteContent({
  onRequestClose,
  onOpenHelp,
  profileHandle,
}: {
  onRequestClose: () => void;
  onOpenHelp: () => void;
  profileHandle: string | null;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const { setTheme } = useBrowserTab();
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    // showModal() moves focus to the <dialog> itself first — grab the
    // input on the next frame so typing can start immediately.
    const frame = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, []);

  const items = useMemo<CommandItem[]>(() => {
    const navigate: CommandItem[] = [
      { id: "nav-feed", label: "Go to Feed", group: "Navigate", hint: "G F", icon: Home, run: () => router.push("/feed") },
      { id: "nav-explore", label: "Go to Explore", group: "Navigate", hint: "G E", icon: Search, run: () => router.push("/explore") },
      { id: "nav-trending", label: "Go to Trending", group: "Navigate", hint: "G T", icon: Flame, run: () => router.push("/trending") },
      { id: "nav-messages", label: "Go to Messages", group: "Navigate", hint: "G M", icon: MessageCircle, run: () => router.push("/messages") },
      { id: "nav-businesses", label: "Go to Businesses", group: "Navigate", hint: "G B", icon: Briefcase, run: () => router.push("/b") },
      { id: "nav-communities", label: "Go to Communities", group: "Navigate", hint: "G C", icon: Users, run: () => router.push("/c") },
      { id: "nav-orgs", label: "Go to Organizations", group: "Navigate", hint: "G O", icon: Building2, run: () => router.push("/org") },
      { id: "nav-notifications", label: "Go to Notifications", group: "Navigate", hint: "G N", icon: Bell, run: () => router.push("/notifications") },
      { id: "nav-bookmarks", label: "Go to Bookmarks", group: "Navigate", hint: "G K", icon: Bookmark, run: () => router.push("/bookmarks") },
      ...(profileHandle
        ? [
            {
              id: "nav-profile",
              label: "Go to your profile",
              group: "Navigate",
              icon: User,
              run: () => router.push(`/${profileHandle}`),
            },
          ]
        : []),
    ];

    const actions: CommandItem[] = [
      {
        id: "action-new-post",
        label: "New post",
        group: "Actions",
        hint: "N",
        icon: PlusCircle,
        run: () => router.push("/feed#compose-box"),
      },
      {
        id: "action-new-message",
        label: "New message",
        group: "Actions",
        icon: MessagesSquare,
        run: () => router.push("/messages/new"),
      },
      {
        id: "action-theme",
        label: "Toggle dark / light theme",
        group: "Actions",
        icon: getEffectiveTheme() === "light" ? Moon : Sun,
        run: () => {
          const next = getEffectiveTheme() === "light" ? "dark" : "light";
          persistTheme(next);
          setTheme(next);
        },
      },
      { id: "action-shortcuts", label: "Keyboard shortcuts", group: "Actions", hint: "?", icon: Keyboard, run: onOpenHelp },
    ];

    // Flattens every settings destination into the same searchable list —
    // settingsNavGroups is already the shared source of truth NavLinks'
    // Settings accordion and AccountMenu both use, so this can't drift.
    const settings: CommandItem[] = profileHandle
      ? settingsNavGroups(profileHandle).flatMap((group) =>
          group.items.map((item) => ({
            id: `settings-${item.href}`,
            label: `Settings: ${group.label} — ${item.label}`,
            group: "Settings",
            icon: SettingsIcon,
            run: () => router.push(item.href),
          }))
        )
      : [];

    return [...navigate, ...actions, ...settings];
  }, [profileHandle, router, onOpenHelp, setTheme]);

  const results = useMemo(() => {
    if (query.trim() === "") return items.slice(0, MAX_RESULTS);
    return items
      .map((item) => ({ item, score: fuzzyMatch(query, item.label) }))
      .filter((entry): entry is { item: CommandItem; score: number } => entry.score !== null)
      .sort((a, b) => a.score - b.score)
      .slice(0, MAX_RESULTS)
      .map((entry) => entry.item);
  }, [items, query]);

  function runItem(item: CommandItem | undefined) {
    if (!item) return;
    item.run();
    onRequestClose();
  }

  return (
    <div
      className="commandPaletteBody"
      onKeyDown={(event) => {
        if (event.key === "ArrowDown") {
          event.preventDefault();
          setActiveIndex((index) => Math.min(index + 1, results.length - 1));
        } else if (event.key === "ArrowUp") {
          event.preventDefault();
          setActiveIndex((index) => Math.max(index - 1, 0));
        } else if (event.key === "Enter") {
          event.preventDefault();
          runItem(results[activeIndex]);
        }
      }}
    >
      <div className="commandPaletteInputRow">
        <Search size={16} aria-hidden="true" className="commandPaletteInputIcon" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(event) => {
            // Reset the selection here (the event that caused it), not in
            // an effect keyed on the result count — same "derive/reset in
            // the handler that caused the change" posture as the rest of
            // this component's state.
            setQuery(event.target.value);
            setActiveIndex(0);
          }}
          placeholder="Jump to a page or run a command…"
          aria-label="Command palette search"
          className="commandPaletteInput"
          autoComplete="off"
          spellCheck={false}
        />
        <kbd className="kbd">Esc</kbd>
      </div>
      <ul className="commandPaletteList">
        {results.length === 0 && <li className="commandPaletteEmpty">No matching commands.</li>}
        {results.map((item, index) => {
          const Icon = item.icon;
          return (
            <li key={item.id}>
              <button
                type="button"
                className={`commandPaletteItem${index === activeIndex ? " commandPaletteItemActive" : ""}`}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => runItem(item)}
              >
                <Icon size={16} aria-hidden="true" />
                <span className="commandPaletteItemLabel">{item.label}</span>
                <span className="commandPaletteItemGroup">{item.group}</span>
                {item.hint && <kbd className="kbd">{item.hint}</kbd>}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

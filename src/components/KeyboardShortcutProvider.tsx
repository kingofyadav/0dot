"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { NAV_SHORTCUTS, isTypingTarget, type ListNavGroup } from "@/lib/keyboard-shortcuts";

// Both overlays start closed on every mount and are only ever needed once
// the user actually triggers Cmd+K or "?" — ssr:false defers their code
// (plus the 13 lucide icons and settings-nav data CommandPalette pulls in)
// off every route's initial bundle entirely, since there's no closed-state
// content worth server-rendering.
const CommandPalette = dynamic(() => import("@/components/CommandPalette").then((m) => m.CommandPalette), { ssr: false });
const ShortcutsHelp = dynamic(() => import("@/components/ShortcutsHelp").then((m) => m.ShortcutsHelp), { ssr: false });

interface KeyboardShortcutContextValue {
  openPalette: () => void;
  openHelp: () => void;
  // Called by ListKeyNav on mount/unmount so ShortcutsHelp can show the
  // list-navigation row set only on pages that actually have one — never
  // more than one ListKeyNav is mounted at a time, so "last write wins" is
  // the same as "the one currently on screen."
  setListNavGroup: (group: ListNavGroup) => void;
}

const KeyboardShortcutContext = createContext<KeyboardShortcutContextValue | null>(null);

const NOOP_CONTEXT: KeyboardShortcutContextValue = {
  openPalette: () => {},
  openHelp: () => {},
  setListNavGroup: () => {},
};

// Same NOOP-fallback posture as useBrowserTab — a component that renders
// outside the provider (there shouldn't be one, but nothing crashes if
// there is) just gets inert callbacks instead of a thrown error.
export function useKeyboardShortcuts(): KeyboardShortcutContextValue {
  return useContext(KeyboardShortcutContext) ?? NOOP_CONTEXT;
}

// A second keypress within this window continues a "g" chord; anything
// slower is treated as two unrelated keystrokes rather than a shortcut.
const CHORD_TIMEOUT_MS = 900;

// The app's one and only global keydown listener (see AGENTS.md-adjacent
// research: nothing else in src/ listens on document/window before this).
// Mounted once at the root so every page gets the same hotkeys without each
// route wiring its own listener — CommandPalette/ShortcutsHelp are rendered
// here too, right alongside the state that opens them, same "provider owns
// its own overlay" posture as ToastProvider's toast stack.
export function KeyboardShortcutProvider({
  profileHandle,
  children,
}: {
  profileHandle: string | null;
  children: ReactNode;
}) {
  const router = useRouter();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [listNavGroup, setListNavGroup] = useState<ListNavGroup>(null);
  const pendingChord = useRef<{ key: string; time: number } | null>(null);
  // The keydown handler is only attached once (empty effect deps) — it
  // reads open state through refs instead of state so it doesn't need to
  // re-subscribe every time a dialog opens or closes.
  const paletteOpenRef = useRef(paletteOpen);
  const helpOpenRef = useRef(helpOpen);

  useEffect(() => {
    paletteOpenRef.current = paletteOpen;
  }, [paletteOpen]);
  useEffect(() => {
    helpOpenRef.current = helpOpen;
  }, [helpOpen]);

  useEffect(() => {
    function focusSearchInput() {
      // Both SearchForm instances (desktop header + sidebar/mobile menu)
      // share name="q" — pick whichever one is actually rendered onscreen
      // (the other is display:none at this viewport, so offsetParent is
      // null for it and it can't take focus anyway).
      const candidates = Array.from(document.querySelectorAll<HTMLInputElement>('input[name="q"]'));
      const visible = candidates.find((el) => el.offsetParent !== null) ?? candidates[0];
      visible?.focus();
    }

    function handleKeyDown(event: KeyboardEvent) {
      const mod = event.metaKey || event.ctrlKey;

      // Cmd/Ctrl+K works everywhere, including while typing — same
      // convention as Slack/Linear/GitHub, since it's a modifier combo a
      // text field would never otherwise want.
      if (mod && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setHelpOpen(false);
        setPaletteOpen((value) => !value);
        return;
      }

      if (isTypingTarget(event.target) || mod || event.altKey) return;
      // A dialog is already up front — let it own the keyboard (its own
      // input is a typing target, but focus can land on non-input elements
      // like the palette's kbd hint) rather than also firing a nav chord.
      if (paletteOpenRef.current || helpOpenRef.current) return;

      const key = event.key.toLowerCase();

      if (pendingChord.current && Date.now() - pendingChord.current.time < CHORD_TIMEOUT_MS) {
        const chordFirstKey = pendingChord.current.key;
        pendingChord.current = null;
        const match = NAV_SHORTCUTS.find((shortcut) => shortcut.chord[0] === chordFirstKey && shortcut.chord[1] === key);
        if (match) {
          event.preventDefault();
          router.push(match.href);
        }
        return;
      }

      if (key === "g") {
        pendingChord.current = { key: "g", time: Date.now() };
        return;
      }
      if (key === "?") {
        event.preventDefault();
        setHelpOpen(true);
        return;
      }
      if (key === "/") {
        event.preventDefault();
        focusSearchInput();
        return;
      }
      if (key === "n") {
        event.preventDefault();
        // ComposeBox only exists inline on /feed (no standalone "new post"
        // route) — same deep link MobileBottomNav's "+" button already
        // uses, so its hashchange listener there covers this too.
        router.push("/feed#compose-box");
        return;
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [router]);

  const value = useMemo<KeyboardShortcutContextValue>(
    () => ({
      openPalette: () => {
        setHelpOpen(false);
        setPaletteOpen(true);
      },
      openHelp: () => {
        setPaletteOpen(false);
        setHelpOpen(true);
      },
      setListNavGroup,
    }),
    []
  );

  return (
    <KeyboardShortcutContext.Provider value={value}>
      {children}
      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onOpenHelp={() => {
          setPaletteOpen(false);
          setHelpOpen(true);
        }}
        profileHandle={profileHandle}
      />
      <ShortcutsHelp open={helpOpen} onClose={() => setHelpOpen(false)} listNavGroup={listNavGroup} />
    </KeyboardShortcutContext.Provider>
  );
}

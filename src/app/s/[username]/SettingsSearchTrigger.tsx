"use client";

import { Search } from "lucide-react";
import { useKeyboardShortcuts } from "@/components/KeyboardShortcutProvider";

// A visible entry point into the existing Cmd/Ctrl+K command palette
// (CommandPalette.tsx already lists every settingsNavGroups() destination,
// fuzzy-searchable) — previously that palette had zero on-screen affordance
// anywhere in the app, only the shortcut itself. With ~40 settings
// destinations across 11 groups and no page-local sidebar (SettingsLayout's
// own comment: nav lives only in the main accordion), this is exactly the
// screen where "jump straight to a setting" earns a visible button.
export function SettingsSearchTrigger() {
  const { openPalette } = useKeyboardShortcuts();

  return (
    <button type="button" className="settingsSearchTrigger" onClick={openPalette}>
      <Search size={14} aria-hidden="true" />
      Search settings
      <kbd className="kbd">⌘K</kbd>
    </button>
  );
}

// Single source of truth for every hotkey the app recognizes, shared by
// KeyboardShortcutProvider (matching), CommandPalette (the "hint" chip next
// to each nav command), and ShortcutsHelp (the "?" cheat sheet) — so the
// three surfaces can't drift out of sync with each other.

export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  return target.isContentEditable;
}

// Cheap substring/subsequence scorer for the command palette — no fuzzy-find
// dependency exists in package.json, and the candidate list is small enough
// (well under a hundred commands) that this needs no indexing. Earlier
// substring matches score better than later ones; a subsequence-only match
// (e.g. "ntf" -> "Notifications") still matches but always sorts behind any
// substring match.
export function fuzzyMatch(query: string, target: string): number | null {
  const q = query.toLowerCase().trim();
  const t = target.toLowerCase();
  if (q === "") return 0;

  const substringIndex = t.indexOf(q);
  if (substringIndex !== -1) return substringIndex;

  let queryIndex = 0;
  let matched = 0;
  for (let i = 0; i < t.length && queryIndex < q.length; i++) {
    if (t[i] === q[queryIndex]) {
      queryIndex++;
      matched++;
    }
  }
  return queryIndex === q.length ? 1000 - matched : null;
}

export type NavShortcut = {
  chord: readonly [string, string];
  keys: string;
  href: string;
  label: string;
};

// "G" then a second key — the same mnemonic-chord convention Gmail/
// Superhuman use ("go to") rather than spending nine single letters on
// destinations, which would eat into letters list navigation already
// reserves for actions (j/k/l/r in ListKeyNav) or plain typing.
export const NAV_SHORTCUTS: NavShortcut[] = [
  { chord: ["g", "f"], keys: "G F", href: "/feed", label: "Go to Feed" },
  { chord: ["g", "e"], keys: "G E", href: "/explore", label: "Go to Explore" },
  { chord: ["g", "t"], keys: "G T", href: "/trending", label: "Go to Trending" },
  { chord: ["g", "m"], keys: "G M", href: "/messages", label: "Go to Messages" },
  { chord: ["g", "b"], keys: "G B", href: "/b", label: "Go to Businesses" },
  { chord: ["g", "c"], keys: "G C", href: "/c", label: "Go to Communities" },
  { chord: ["g", "o"], keys: "G O", href: "/org", label: "Go to Organizations" },
  { chord: ["g", "n"], keys: "G N", href: "/notifications", label: "Go to Notifications" },
  { chord: ["g", "k"], keys: "G K", href: "/bookmarks", label: "Go to Bookmarks" },
];

export const GLOBAL_SHORTCUTS: { keys: string; label: string }[] = [
  { keys: "⌘/Ctrl K", label: "Open command palette" },
  { keys: "/", label: "Focus search" },
  { keys: "N", label: "New post" },
  { keys: "?", label: "Show this list" },
  { keys: "Esc", label: "Close a dialog" },
];

export type ListNavGroup = { title: string; items: { keys: string; label: string }[] } | null;

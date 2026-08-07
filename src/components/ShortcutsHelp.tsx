"use client";

import { Modal } from "@/components/Modal";
import { GLOBAL_SHORTCUTS, NAV_SHORTCUTS, type ListNavGroup } from "@/lib/keyboard-shortcuts";

function ShortcutRow({ keys, label }: { keys: string; label: string }) {
  return (
    <div className="shortcutRow">
      <span>{label}</span>
      <span className="shortcutKeys">
        {keys.split(" ").map((key) => (
          <kbd key={key} className="kbd">
            {key}
          </kbd>
        ))}
      </span>
    </div>
  );
}

function ShortcutGroup({ title, rows }: { title: string; rows: { keys: string; label: string }[] }) {
  return (
    <div className="shortcutGroup">
      <h3 className="shortcutGroupTitle">{title}</h3>
      {rows.map((row) => (
        <ShortcutRow key={row.label} keys={row.keys} label={row.label} />
      ))}
    </div>
  );
}

// Built on Modal (native <dialog>, same as everywhere else) rather than a
// bespoke overlay — this is just a titled dialog with static content, the
// exact shape Modal already covers.
export function ShortcutsHelp({
  open,
  onClose,
  listNavGroup,
}: {
  open: boolean;
  onClose: () => void;
  listNavGroup: ListNavGroup;
}) {
  return (
    <Modal open={open} onClose={onClose} title="Keyboard shortcuts">
      <div className="shortcutGroups">
        <ShortcutGroup title="Global" rows={GLOBAL_SHORTCUTS} />
        <ShortcutGroup
          title="Navigate (press G, then…)"
          rows={NAV_SHORTCUTS.map((shortcut) => ({ keys: shortcut.keys, label: shortcut.label }))}
        />
        {/* Only present on pages that actually have a navigable list — see
            ListKeyNav, which registers/clears this on mount/unmount. */}
        {listNavGroup && <ShortcutGroup title={listNavGroup.title} rows={listNavGroup.items} />}
      </div>
    </Modal>
  );
}

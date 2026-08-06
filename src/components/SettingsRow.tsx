import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronRight, type LucideIcon } from "lucide-react";

// One row inside a .settingsGroup card (globals.css) — the shared building
// block for the Android-Settings-style redesign of /s/[username]/*. Renders
// as a <Link> when href is given (navigation row, gets a trailing chevron
// unless a custom `trailing` node is supplied instead), otherwise a plain
// <div> for hosting an inline control like a switch.
export function SettingsRow({
  icon: Icon,
  label,
  description,
  trailing,
  href,
  chevron,
}: {
  icon?: LucideIcon;
  label: ReactNode;
  description?: ReactNode;
  trailing?: ReactNode;
  href?: string;
  chevron?: boolean;
}) {
  const showChevron = chevron ?? (!!href && !trailing);

  const content = (
    <>
      {Icon && (
        <span className="settingsRowIcon" aria-hidden="true">
          <Icon size={18} />
        </span>
      )}
      <span className="settingsRowText">
        <span className="settingsRowLabel">{label}</span>
        {description && <span className="settingsRowDescription">{description}</span>}
      </span>
      {trailing && <span className="settingsRowTrailing">{trailing}</span>}
      {showChevron && <ChevronRight size={18} className="settingsRowChevron" aria-hidden="true" />}
    </>
  );

  if (href) {
    return (
      <Link href={href} className="settingsRow">
        {content}
      </Link>
    );
  }

  return <div className="settingsRow">{content}</div>;
}

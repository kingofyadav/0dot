import type { ChangeEventHandler } from "react";

// Visual/markup half of the .switch CSS (globals.css) — a native checkbox
// (keeps keyboard/screen-reader semantics + form participation) plus the
// styled track+thumb sibling. Shared by every settings toggle (previously
// duplicated per usage, e.g. DeliveryToggle.tsx) instead of hand-rolling
// the same 3 elements at each call site.
export function Switch({
  name,
  value = "true",
  defaultChecked,
  disabled,
  onChange,
  "aria-label": ariaLabel,
}: {
  name: string;
  value?: string;
  defaultChecked?: boolean;
  disabled?: boolean;
  onChange?: ChangeEventHandler<HTMLInputElement>;
  "aria-label"?: string;
}) {
  return (
    <label className="switch">
      <input
        type="checkbox"
        name={name}
        value={value}
        defaultChecked={defaultChecked}
        disabled={disabled}
        onChange={onChange}
        aria-label={ariaLabel}
      />
      <span className="switchTrack">
        <span className="switchThumb" />
      </span>
    </label>
  );
}

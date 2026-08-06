"use client";

import { useState } from "react";
import { CircleCheck } from "lucide-react";

const USERNAME_PATTERN = /^[a-zA-Z0-9_]{3,30}$/;

type UsernameFieldProps = {
  id: string;
};

// Live preview of the actual profile URL as it's typed, plus a checkmark
// once the format is valid — the regex mirrors the input's own
// pattern/minLength/maxLength attributes (still enforced server-side in
// signup(), auth.ts) so this is a same-tick visual echo, not a second
// source of truth. Doesn't check availability (that needs a DB round-trip);
// "this is permanent" already primes people to pick carefully before
// submitting.
export function UsernameField({ id }: UsernameFieldProps) {
  const [value, setValue] = useState("");
  const valid = USERNAME_PATTERN.test(value);

  return (
    <div className="field">
      <label htmlFor={id}>Username</label>
      <input
        id={id}
        name="username"
        type="text"
        placeholder="yourname"
        autoComplete="username"
        pattern="[a-zA-Z0-9_]{3,30}"
        minLength={3}
        maxLength={30}
        required
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
      <span className={valid ? "usernameHint usernameHintValid" : "usernameHint"}>
        {valid && <CircleCheck size={13} aria-hidden="true" />}
        0dot.in/{value.trim() || "yourname"} — this is permanent.
      </span>
    </div>
  );
}

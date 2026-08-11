"use client";

import { useEffect, useRef, useState } from "react";
import { CircleCheck, CircleX, CircleAlert, LoaderCircle } from "lucide-react";
import { track } from "@vercel/analytics";
import { checkUsernameAvailability, type UsernameAvailability } from "@/app/actions/auth";

const USERNAME_PATTERN = /^[a-zA-Z0-9_]{3,30}$/;
const DEBOUNCE_MS = 400;

type UsernameFieldProps = {
  id: string;
};

type Status = "idle" | "invalid" | "checking" | "network_error" | UsernameAvailability;

// Live preview of the actual profile URL as it's typed, plus a debounced
// server-side availability check (spec §11/§13's explicit state list:
// empty/checking/available/unavailable/invalid/reserved/network error) —
// the regex below is still the same same-tick format echo as before
// (mirrors the input's own pattern/minLength/maxLength, still enforced
// server-side in signup(), auth.ts), but format-valid no longer means
// "submit and hope": checkUsernameAvailability (auth.ts) hits the same
// db.username lookup signup() uses, just earlier. signup() remains the
// actual authority and re-checks everything itself regardless of what this
// field reports. Status transitions live in the onChange handler itself
// (not a useEffect keyed on `value`) — the debounced check is the only part
// that genuinely needs to run later, so only its cleanup (clearing a
// pending timer on unmount) needs an effect at all.
export function UsernameField({ id }: UsernameFieldProps) {
  const [value, setValue] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestValueRef = useRef("");

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  function handleChange(next: string) {
    setValue(next);
    latestValueRef.current = next;
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!next) {
      setStatus("idle");
      return;
    }
    if (!USERNAME_PATTERN.test(next)) {
      setStatus("invalid");
      return;
    }

    setStatus("checking");
    debounceRef.current = setTimeout(() => {
      track("username_check");
      checkUsernameAvailability(next)
        .then((result) => {
          if (latestValueRef.current !== next) return; // input moved on, stale response
          setStatus(result);
          if (result === "available") track("username_available");
        })
        .catch(() => {
          if (latestValueRef.current === next) setStatus("network_error");
        });
    }, DEBOUNCE_MS);
  }

  const url = `0dot.in/${value.trim() || "yourname"}`;
  const { icon, text, className } = describeStatus(status, url);

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
        onChange={(e) => handleChange(e.target.value)}
      />
      <span className={className} aria-live="polite">
        {icon}
        {text}
      </span>
    </div>
  );
}

function describeStatus(status: Status, url: string) {
  switch (status) {
    case "checking":
      return {
        icon: <LoaderCircle size={13} aria-hidden="true" />,
        text: `Checking ${url}…`,
        className: "usernameHint usernameHintChecking",
      };
    case "available":
      return {
        icon: <CircleCheck size={13} aria-hidden="true" />,
        text: `${url} is available`,
        className: "usernameHint usernameHintValid",
      };
    case "taken":
      return {
        icon: <CircleX size={13} aria-hidden="true" />,
        text: `${url} is already taken`,
        className: "usernameHint usernameHintError",
      };
    case "reserved":
      return {
        icon: <CircleX size={13} aria-hidden="true" />,
        text: "That username is reserved.",
        className: "usernameHint usernameHintError",
      };
    case "invalid":
      return {
        icon: <CircleAlert size={13} aria-hidden="true" />,
        text: "3–30 characters: letters, numbers, underscore only.",
        className: "usernameHint usernameHintError",
      };
    case "network_error":
      return {
        icon: <CircleAlert size={13} aria-hidden="true" />,
        text: "Couldn't check availability — we'll check again when you submit.",
        className: "usernameHint",
      };
    default:
      return {
        icon: null,
        text: `${url} — this is permanent.`,
        className: "usernameHint",
      };
  }
}

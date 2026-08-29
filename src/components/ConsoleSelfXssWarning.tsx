"use client";

import { useEffect } from "react";

// Deters "self-XSS" social engineering — scams that talk a logged-in user
// into pasting attacker-supplied JS into their own DevTools console (fake
// "hack tool" / "free followers" instructions, etc). Same pattern Facebook,
// Google, and most large sites ship; the warning is the only real defense
// since the browser can't tell a user's own paste from a developer's.
//
// Module-level guard, not a ref: dev-mode Strict Mode mounts every component
// twice (mount → unmount → remount) specifically to surface effects that
// aren't idempotent, which would otherwise print this twice on every dev
// load. A ref resets on that remount same as state would; a module-level
// flag survives it, and still only guards this one page load (a real
// navigation reloads the module).
let hasWarned = false;

export function ConsoleSelfXssWarning() {
  useEffect(() => {
    if (hasWarned) return;
    hasWarned = true;
    console.log(
      "%cStop!",
      "color: #ff3b30; font-size: 60px; font-weight: bold; text-shadow: 1px 1px black;",
    );
    console.log(
      "%cThis is a browser feature intended for developers. If someone told you to copy and paste something here to enable a feature or \"hack\" someone's account, it's a scam and will give them access to your 0dot account.",
      "font-size: 16px;",
    );
    console.log(
      "%cSee https://0dot.in/trust-safety for more information.",
      "font-size: 16px;",
    );
  }, []);
  return null;
}

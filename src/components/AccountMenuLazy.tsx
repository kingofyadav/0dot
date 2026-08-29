"use client";

import dynamic from "next/dynamic";

// SiteHeader is a Server Component — next/dynamic's actual code-splitting
// only kicks in from a Client Component context, so this thin wrapper is
// what lets AccountMenu's Radix DropdownMenu internals land in their own
// chunk instead of riding along with whatever else Turbopack groups
// AccountMenu.tsx's static import into for every route that renders a header.
export const AccountMenu = dynamic(() => import("./AccountMenu").then((m) => m.AccountMenu));

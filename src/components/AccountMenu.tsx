"use client";

import Link from "next/link";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar } from "@/components/Avatar";
import { logout } from "@/app/actions/auth";
import { settingsNavGroups } from "@/lib/settings-nav";

// Replaces the plain-text header greeting for a signed-in user with an
// avatar-led account menu — the header's own quick path to Profile/Settings/
// Log out, on top of (not instead of) the same destinations already in
// Sidebar/NavAction's hamburger panel. Settings (/s/[handle]) previously had
// no global nav entry point at all — see NavLinks.tsx's added entry — this
// is the second.
export function AccountMenu({
  displayName,
  avatarUrl,
  profileHandle,
}: {
  displayName: string;
  avatarUrl: string | null;
  profileHandle: string;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className="accountMenuTrigger" aria-label={`Account menu for ${displayName}`}>
          <Avatar src={avatarUrl} alt="" size={32} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem asChild>
          <Link href={`/${profileHandle}`}>View profile</Link>
        </DropdownMenuItem>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>Settings</DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="max-h-[70vh] overflow-y-auto">
            {settingsNavGroups(profileHandle).map((group) => (
              <div key={group.label}>
                <DropdownMenuLabel>{group.label}</DropdownMenuLabel>
                {group.items.map((item) => (
                  <DropdownMenuItem key={item.href} asChild>
                    <Link href={item.href}>{item.label}</Link>
                  </DropdownMenuItem>
                ))}
              </div>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <form action={logout} style={{ width: "100%" }}>
            <button type="submit" style={{ width: "100%", textAlign: "left", background: "none", border: "none", padding: 0, font: "inherit", color: "inherit", cursor: "pointer" }}>
              Log out
            </button>
          </form>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

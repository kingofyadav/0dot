import Link from "next/link";
import { logout } from "@/app/actions/auth";

// The bottom-of-nav action: log out for a signed-in user, or a join CTA for
// an anonymous visitor on someone's profile page. Shared between Sidebar and
// the mobile hamburger dropdown.
export function NavAction({
  hasProfile,
  showJoinCta,
}: {
  hasProfile: boolean;
  showJoinCta: boolean;
}) {
  if (hasProfile) {
    return (
      <form action={logout}>
        <button
          type="submit"
          className="button buttonSecondary"
          style={{ width: "100%" }}
        >
          Log out
        </button>
      </form>
    );
  }

  if (showJoinCta) {
    return (
      <Link href="/" className="button" style={{ display: "block", textAlign: "center" }}>
        Join for free
      </Link>
    );
  }

  return null;
}

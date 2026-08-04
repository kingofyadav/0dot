import { NextRequest, NextResponse } from "next/server";
import { unsubscribeByToken } from "@/app/actions/newsletter";

// spec §10.2: the literal one-click unsubscribe link every sent issue
// embeds — a GET Route Handler (not a form) since CAN-SPAM's "one click"
// requirement means no extra confirmation step, same "works with JS
// disabled" reasoning /r/[linkId] already established for link clicks.
export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const unsubscribed = await unsubscribeByToken(token);
  return NextResponse.redirect(new URL(unsubscribed ? "/newsletter/unsubscribed" : "/", request.url));
}

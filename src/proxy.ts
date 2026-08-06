import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Makes the current pathname available to Server Components (e.g.
// SiteHeader) via headers() — there's no other way to read it from a
// layout, which doesn't receive page-specific route data.
export function proxy(request: NextRequest) {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-pathname", request.nextUrl.pathname);
  return NextResponse.next({ request: { headers: requestHeaders } });
}

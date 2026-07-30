import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Makes the current pathname available to Server Components (e.g.
// SiteHeader) via headers() — there's no other way to read it from a
// layout, which doesn't receive page-specific route data.
export function proxy(request: NextRequest) {
  const response = NextResponse.next();
  response.headers.set("x-pathname", request.nextUrl.pathname);
  return response;
}

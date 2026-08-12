import { NextResponse } from "next/server";
import { exportAccountData } from "@/app/actions/account-lifecycle";

// addendum §7: streams the export as a download rather than inventing a
// "generated file" model/storage row for a one-shot JSON blob — there's no
// existing model this would reuse. requireVerifiedUser() runs inside
// exportAccountData itself, same self-authenticating posture as every other
// call site.
export async function GET() {
  const data = await exportAccountData();

  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="0dot-account-export.json"`,
    },
  });
}

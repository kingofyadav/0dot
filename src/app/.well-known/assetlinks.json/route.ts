import { NextResponse } from "next/server";

// phase-15 spec §5.3: Android App Links' equivalent of
// apple-app-site-association — SHA256_CERT_FINGERPRINT must be replaced
// with the real signing certificate's fingerprint at deploy time, same
// placeholder posture as apple-app-site-association's TEAM_ID.
const PACKAGE_NAME = "in.0dot.android";
const SHA256_CERT_FINGERPRINT = "00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00";

export function GET() {
  return NextResponse.json([
    {
      relation: ["delegate_permission/common.handle_all_urls"],
      target: {
        namespace: "android_app",
        package_name: PACKAGE_NAME,
        sha256_cert_fingerprints: [SHA256_CERT_FINGERPRINT],
      },
    },
  ]);
}

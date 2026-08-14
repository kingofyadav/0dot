import "server-only";
import QRCode from "qrcode";

// Coins are USD-pegged (1 coin = $1) but UPI only moves INR, so a top-up's
// INR amount is computed once at request-creation time (coinsToInr, called
// from createTopUpRequest in wallet.ts) and stored on the row — this rate
// is never read back out of a pending/past request, only used going
// forward, so changing it never rewrites what an in-flight request expects
// to be paid. Placeholder value, same "flag it, don't invent silently"
// posture as platform-billing.ts's PLAN_PRICES — review before real money
// moves.
export const USD_COIN_TO_INR_RATE = 90;

export function coinsToInr(coinAmount: number): number {
  return Math.round(coinAmount * USD_COIN_TO_INR_RATE);
}

// No payment gateway in this build — a top-up is a plain UPI transfer
// straight to the platform's own VPA, confirmed manually (CoinTopUpRequest),
// not via any processor webhook.
export function buildUpiDeepLink(params: { amountInr: number; referenceCode: string }): string {
  const vpa = process.env.PLATFORM_UPI_VPA;
  const payeeName = process.env.PLATFORM_UPI_PAYEE_NAME;
  if (!vpa || !payeeName) {
    throw new Error("PLATFORM_UPI_VPA / PLATFORM_UPI_PAYEE_NAME are not configured.");
  }

  const query = new URLSearchParams({
    pa: vpa,
    pn: payeeName,
    am: String(params.amountInr),
    cu: "INR",
    tn: params.referenceCode,
  });
  return `upi://pay?${query.toString()}`;
}

// Same call shape as src/app/qr/[handle]/route.ts — SVG, fixed
// black-on-white regardless of theme, since QR scanners need strong
// contrast.
export async function renderUpiQrSvg(deepLink: string): Promise<string> {
  return QRCode.toString(deepLink, {
    type: "svg",
    margin: 1,
    color: { dark: "#171717", light: "#ffffff" },
  });
}

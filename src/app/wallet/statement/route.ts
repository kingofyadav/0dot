import { requireVerifiedUser } from "@/lib/auth-guards";
import { db } from "@/lib/db";

// addendum-coin-wallet-v2.md §10 — a server-streamed CSV of the caller's
// coin ledger (never a client-side download). `from`/`to` are ISO dates;
// the running balance column carries the opening balance forward when
// `from` is set. PDF is a later addition.
export async function GET(request: Request) {
  const user = await requireVerifiedUser();
  const url = new URL(request.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const fromDate = from ? new Date(from) : null;
  const toDate = to ? new Date(to) : null;

  const accounts = await db.ledgerAccount.findMany({
    where: { ownerUserId: user.id },
    select: { id: true },
  });
  const accountIds = accounts.map((a) => a.id);

  let openingBalance = 0;
  if (fromDate && accountIds.length) {
    const prior = await db.ledgerPosting.aggregate({
      _sum: { amount: true },
      where: { accountId: { in: accountIds }, createdAt: { lt: fromDate } },
    });
    openingBalance = prior._sum.amount ?? 0;
  }

  const rows = accountIds.length
    ? await db.ledgerPosting.findMany({
        where: {
          accountId: { in: accountIds },
          ...(fromDate || toDate
            ? { createdAt: { ...(fromDate ? { gte: fromDate } : {}), ...(toDate ? { lte: toDate } : {}) } }
            : {}),
        },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        include: { transaction: { select: { kind: true, memo: true } } },
      })
    : [];

  // Quote, double embedded quotes, and neutralize a leading formula
  // character (= + - @, tab, CR) so a memo like `=HYPERLINK(...)` — from an
  // admin grant/refund reason — can't execute when the file is opened in
  // Excel or Sheets (CSV injection).
  const csvCell = (v: string) => {
    const safe = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
    return `"${safe.replace(/"/g, '""')}"`;
  };
  const lines = ["date,kind,memo,amount_coins,running_balance_coins"];
  let balance = openingBalance;
  for (const p of rows) {
    balance += p.amount;
    lines.push(
      [
        p.createdAt.toISOString(),
        csvCell(p.transaction.kind),
        csvCell(p.transaction.memo ?? ""),
        (p.amount / 100).toString(),
        (balance / 100).toString(),
      ].join(","),
    );
  }

  return new Response(lines.join("\n") + "\n", {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="0dot-wallet-statement.csv"',
      "Cache-Control": "no-store",
    },
  });
}

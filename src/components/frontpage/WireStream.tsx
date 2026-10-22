"use client";

import Link from "next/link";
import Image from "next/image";
import { Fragment, useCallback, useRef, useState } from "react";
import { BadgeCheck, Heart, Loader2, MessageCircle } from "lucide-react";
import { formatAgo } from "@/lib/landing-content";

// Serialized WireItem (src/lib/front-page.ts): createdAt arrives as an ISO
// string over the wire JSON, so the client type says so.
export type WireCard = {
  id: string;
  headline: string;
  rest: string;
  createdAt: string;
  imageUrl: string | null;
  likeCount: number;
  replyCount: number;
  official: boolean;
  author: { handle: string; displayName: string; avatarUrl: string | null };
};

type Batch = { key: string; items: WireCard[] };

// The landing page's endless Wire. The first batch is server-rendered (so
// it's in the HTML for crawlers and no-JS visitors); later batches load from
// /api/front-page/wire only on an explicit "Load more stories" click — no
// scroll-triggered auto-loading, so scrolling past the first batch never
// fires a burst of background requests on its own. After each batch comes
// one of the server-rendered feature blocks (`features`: video, follow,
// developers, sign-up), in rotation, so the page keeps making its case
// however far someone scrolls. The button is also the retry path after an
// error.
export function WireStream({
  initialItems,
  initialNext,
  features,
}: {
  initialItems: WireCard[];
  initialNext: string | null;
  features: React.ReactNode[];
}) {
  const [batches, setBatches] = useState<Batch[]>([{ key: "initial", items: initialItems }]);
  const [next, setNext] = useState(initialNext);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [announcement, setAnnouncement] = useState("");
  const inFlight = useRef(false);
  // Every cursor already fetched. The observer can fire again with the
  // previous cursor between a fetch finishing and the re-render that swaps
  // in the new one; without this, that re-fetches the same page and
  // appends its stories twice.
  const requested = useRef(new Set<string>());

  const loadMore = useCallback(async () => {
    if (!next || inFlight.current || requested.current.has(next)) return;
    inFlight.current = true;
    requested.current.add(next);
    setStatus("loading");
    try {
      const res = await fetch(`/api/front-page/wire?cursor=${encodeURIComponent(next)}`);
      if (!res.ok) throw new Error(`wire ${res.status}`);
      const page: { items: WireCard[]; next: string | null } = await res.json();
      // A phase hand-over page can come back empty with a next cursor — just
      // move the cursor on; the sentinel is still in view and fires again.
      if (page.items.length > 0) setBatches((b) => [...b, { key: next, items: page.items }]);
      setNext(page.next);
      setStatus("idle");
      setAnnouncement(page.items.length > 0 ? `Loaded ${page.items.length} more stories.` : "");
    } catch {
      requested.current.delete(next); // allow the retry button to refetch it
      setStatus("error");
    } finally {
      inFlight.current = false;
    }
  }, [next]);

  const now = new Date();
  const hasAny = batches.some((b) => b.items.length > 0);

  return (
    <div className="fpWire">
      {!hasAny && !next && (
        <p className="fpEmpty">The wire is quiet right now — new stories land here as they&apos;re posted.</p>
      )}

      {batches.map((batch, i) => (
        <Fragment key={batch.key}>
          {batch.items.length > 0 && (
            <ol className="fpWireGrid">
              {batch.items.map((item) => (
                <li key={item.id} className={item.imageUrl ? "fpWireCard fpWireCardImage" : "fpWireCard"}>
                  <Link href={`/${item.author.handle}/status/${item.id}`} prefetch={false}>
                    {item.imageUrl && (
                      <div className="fpWireCardMedia">
                        <Image
                          src={item.imageUrl}
                          alt=""
                          fill
                          sizes="(max-width: 760px) 100vw, (min-width: 1100px) 560px, 340px"
                          style={{ objectFit: "cover" }}
                        />
                      </div>
                    )}
                    <span className="fpWireKicker">
                      {item.official ? (
                        <>
                          From the newsroom <BadgeCheck size={13} aria-hidden="true" />
                        </>
                      ) : (
                        <>@{item.author.handle}</>
                      )}
                    </span>
                    <h3>{item.headline}</h3>
                    {item.rest && <p>{item.rest}</p>}
                    <span className="fpWireMeta">
                      <span>
                        {item.official ? item.author.displayName : `By ${item.author.displayName}`} ·{" "}
                        <time dateTime={item.createdAt} suppressHydrationWarning>
                          {formatAgo(new Date(item.createdAt), now)}
                        </time>
                      </span>
                      <span className="fpWireStats">
                        <Heart size={13} aria-hidden="true" /> {item.likeCount}
                        <MessageCircle size={13} aria-hidden="true" /> {item.replyCount}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ol>
          )}
          {features.length > 0 && batch.items.length > 0 && (
            <div className="fpWireFeature">{features[i % features.length]}</div>
          )}
        </Fragment>
      ))}

      <div className="fpWireFooter">
        {next ? (
          <button type="button" className="button buttonSecondary" onClick={loadMore} disabled={status === "loading"}>
            {status === "loading" ? (
              <>
                <Loader2 size={16} className="fpSpin" aria-hidden="true" /> Loading stories…
              </>
            ) : status === "error" ? (
              "Couldn't load more — try again"
            ) : (
              "Load more stories"
            )}
          </button>
        ) : (
          hasAny && <p className="fpWireEnd">You&apos;re all caught up — that&apos;s every public story on 0dot so far.</p>
        )}
      </div>
      <p className="srOnly" aria-live="polite">
        {announcement}
      </p>
    </div>
  );
}

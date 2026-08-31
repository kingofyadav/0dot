"use client";

import { useActionState } from "react";
import { rsvpToEvent, purchaseTicket } from "@/app/actions/events";
import { IdempotencyField } from "@/components/IdempotencyField";

type TicketType = {
  id: string;
  name: string;
  price: number | null;
  currency: string | null;
  quantityTotal: number | null;
  quantitySold: number;
};

function RSVPButtons({ eventId, currentStatus }: { eventId: string; currentStatus: string | null }) {
  const [state, formAction, pending] = useActionState(rsvpToEvent, undefined);

  return (
    <div>
      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
        {(["going", "interested", "not_going"] as const).map((status) => (
          <form action={formAction} key={status}>
            <input type="hidden" name="eventId" value={eventId} />
            <input type="hidden" name="status" value={status} />
            <button
              type="submit"
              className={`button ${currentStatus === status ? "" : "buttonSecondary"}`}
              disabled={pending}
              style={{ fontSize: "0.85rem", padding: "0.4rem 0.7rem" }}
            >
              {status === "going" ? "Going" : status === "interested" ? "Interested" : "Not going"}
            </button>
          </form>
        ))}
      </div>
      {state?.error && <p className="errorText">{state.error}</p>}
    </div>
  );
}

function TicketPurchaseRow({ ticketType, viewerCoins }: { ticketType: TicketType; viewerCoins: number }) {
  const [state, formAction, pending] = useActionState(purchaseTicket, undefined);
  const soldOut = ticketType.quantityTotal !== null && ticketType.quantitySold >= ticketType.quantityTotal;
  const canAffordCoins = ticketType.price !== null && viewerCoins >= ticketType.price;

  return (
    <div className="profileLinkItem" style={{ flexDirection: "column", alignItems: "stretch", gap: "0.4rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontWeight: 600 }}>{ticketType.name}</span>
        <span className="mutedText" style={{ fontSize: "0.85rem" }}>
          {ticketType.price === null ? "Free" : `${(ticketType.currency ?? "usd").toUpperCase()} ${ticketType.price.toFixed(2)}`}
        </span>
      </div>
      {ticketType.quantityTotal !== null && (
        <span className="mutedText" style={{ fontSize: "0.8rem" }}>
          {ticketType.quantityTotal - ticketType.quantitySold} left of {ticketType.quantityTotal}
        </span>
      )}
      <form action={formAction} style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
        <input type="hidden" name="ticketTypeId" value={ticketType.id} />
        <IdempotencyField />
        <button type="submit" name="payWith" value="card" className="button buttonSecondary" disabled={pending || soldOut} style={{ fontSize: "0.85rem" }}>
          {soldOut ? "Sold out" : pending ? "Purchasing…" : ticketType.price === null ? "Get free ticket" : "Buy ticket"}
        </button>
        {ticketType.price !== null && !soldOut && (
          <button
            type="submit"
            name="payWith"
            value="coins"
            className="button buttonSecondary"
            disabled={pending || !canAffordCoins}
            style={{ fontSize: "0.85rem" }}
          >
            {ticketType.price} coins
          </button>
        )}
      </form>
      {state?.error && <p className="errorText">{state.error}</p>}
      {ticketType.price !== null && !soldOut && !canAffordCoins && (
        <p className="mutedText" style={{ fontSize: "0.75rem" }}>You have {viewerCoins} of {ticketType.price} coins.</p>
      )}
    </div>
  );
}

export function EventActions({
  eventId,
  currentRsvpStatus,
  ticketTypes,
  myTickets,
  viewerCoins,
}: {
  eventId: string;
  currentRsvpStatus: string | null;
  ticketTypes: TicketType[];
  myTickets: { id: string; qrCodeToken: string; status: string; ticketTypeName: string }[];
  viewerCoins: number;
}) {
  return (
    <div style={{ marginTop: "var(--space-5)", display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
      <RSVPButtons eventId={eventId} currentStatus={currentRsvpStatus} />

      {ticketTypes.length > 0 && (
        <div>
          <p className="sectionHeading">Tickets</p>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {ticketTypes.map((tt) => (
              <TicketPurchaseRow key={tt.id} ticketType={tt} viewerCoins={viewerCoins} />
            ))}
          </div>
        </div>
      )}

      {myTickets.length > 0 && (
        <div>
          <p className="sectionHeading">Your tickets</p>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
            {myTickets.map((t) => (
              <div key={t.id} className="profileLinkItem" style={{ flexDirection: "column", alignItems: "stretch" }}>
                <span style={{ fontWeight: 600 }}>{t.ticketTypeName}</span>
                <span className="mutedText" style={{ fontSize: "0.8rem" }}>
                  Status: {t.status.replace("_", " ")}
                </span>
                <span className="mutedText" style={{ fontSize: "0.75rem", wordBreak: "break-all" }}>
                  QR code: {t.qrCodeToken}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

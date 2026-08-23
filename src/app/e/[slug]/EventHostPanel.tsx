"use client";

import { useActionState, useState } from "react";
import { updateEvent, publishEvent, cancelEvent, createTicketType, checkInTicket } from "@/app/actions/events";
import { startBusinessPayoutOnboarding } from "@/app/actions/payments";
import { STRIPE_CONNECT_SUPPORTED_COUNTRIES, PAYOUT_COUNTRY_COMING_SOON } from "@/lib/stripe-connect-countries";

type EventDetails = {
  id: string;
  title: string;
  description: string;
  format: string;
  location: string | null;
  virtualJoinUrl: string | null;
  timezone: string;
  capacity: number | null;
  attendeeListVisibility: string;
  startsAt: string; // datetime-local formatted
  endsAt: string; // datetime-local formatted, or ""
  status: string;
};

function EditForm({ event }: { event: EventDetails }) {
  const [state, formAction, pending] = useActionState(updateEvent, undefined);
  const [format, setFormat] = useState(event.format);

  return (
    <form action={formAction} className="authCard" style={{ maxWidth: "none" }}>
      <input type="hidden" name="eventId" value={event.id} />
      <div className="field">
        <label htmlFor="edit-title">Title</label>
        <input id="edit-title" name="title" type="text" maxLength={160} defaultValue={event.title} required />
      </div>
      <div className="field">
        <label htmlFor="edit-description">Description</label>
        <textarea id="edit-description" name="description" maxLength={10000} rows={4} defaultValue={event.description} />
      </div>
      <div className="field">
        <label htmlFor="edit-format">Format</label>
        <select id="edit-format" name="format" value={format} onChange={(e) => setFormat(e.target.value)}>
          <option value="in_person">In person</option>
          <option value="virtual">Virtual</option>
          <option value="hybrid">Hybrid</option>
        </select>
      </div>
      {format !== "virtual" && (
        <div className="field">
          <label htmlFor="edit-location">Location</label>
          <input id="edit-location" name="location" type="text" maxLength={200} defaultValue={event.location ?? ""} required />
        </div>
      )}
      {format !== "in_person" && (
        <div className="field">
          <label htmlFor="edit-virtualJoinUrl">Virtual join link</label>
          <input id="edit-virtualJoinUrl" name="virtualJoinUrl" type="text" maxLength={500} defaultValue={event.virtualJoinUrl ?? ""} />
        </div>
      )}
      <div className="field">
        <label htmlFor="edit-startsAt">Starts</label>
        <input id="edit-startsAt" name="startsAt" type="datetime-local" defaultValue={event.startsAt} required />
      </div>
      <div className="field">
        <label htmlFor="edit-endsAt">Ends (optional)</label>
        <input id="edit-endsAt" name="endsAt" type="datetime-local" defaultValue={event.endsAt} />
      </div>
      <div className="field">
        <label htmlFor="edit-timezone">Timezone</label>
        <input id="edit-timezone" name="timezone" type="text" maxLength={60} defaultValue={event.timezone} required />
      </div>
      <div className="field">
        <label htmlFor="edit-capacity">Capacity (optional)</label>
        <input id="edit-capacity" name="capacity" type="number" min={1} defaultValue={event.capacity ?? ""} />
      </div>
      <div className="field">
        <label htmlFor="edit-attendeeListVisibility">Who can see the attendee list</label>
        <select id="edit-attendeeListVisibility" name="attendeeListVisibility" defaultValue={event.attendeeListVisibility}>
          <option value="public">Anyone</option>
          <option value="attendees_only">Attendees only</option>
          <option value="host_only">Host only</option>
        </select>
      </div>
      <div className="field">
        <label htmlFor="edit-coverImage">Replace cover image</label>
        <input id="edit-coverImage" name="coverImage" type="file" accept="image/png,image/jpeg,image/webp,image/gif" />
      </div>
      {state?.error && <p className="errorText">{state.error}</p>}
      <button type="submit" className="button" disabled={pending}>
        {pending ? "Saving…" : "Save changes"}
      </button>
    </form>
  );
}

function TicketTypeForm({ eventId }: { eventId: string }) {
  const [state, formAction, pending] = useActionState(createTicketType, undefined);
  return (
    <form action={formAction} className="authCard" style={{ maxWidth: "none" }}>
      <input type="hidden" name="eventId" value={eventId} />
      <div className="field">
        <label htmlFor="tt-name">Name</label>
        <input id="tt-name" name="name" type="text" maxLength={80} placeholder="General Admission" required />
      </div>
      <div className="field">
        <label htmlFor="tt-price">Price (leave blank for free)</label>
        <input id="tt-price" name="price" type="number" min={0.01} step={0.01} />
      </div>
      <div className="field">
        <label htmlFor="tt-quantity">Quantity (leave blank for unlimited)</label>
        <input id="tt-quantity" name="quantityTotal" type="number" min={1} />
      </div>
      {state?.error && <p className="errorText">{state.error}</p>}
      <button type="submit" className="button buttonSecondary" disabled={pending}>
        {pending ? "Adding…" : "Add ticket type"}
      </button>
    </form>
  );
}

function CheckInForm() {
  const [state, formAction, pending] = useActionState(checkInTicket, undefined);
  return (
    <form action={formAction} style={{ display: "flex", gap: "0.5rem", alignItems: "flex-start" }}>
      <div className="field" style={{ flex: 1 }}>
        <input name="qrCodeToken" type="text" placeholder="Scan or paste QR code token" required />
      </div>
      <button type="submit" className="button buttonSecondary" disabled={pending}>
        {pending ? "Checking in…" : "Check in"}
      </button>
      {state?.error && <p className="errorText">{state.error}</p>}
    </form>
  );
}

function BusinessPayoutButton({ businessId, hasAccount }: { businessId: string; hasAccount: boolean }) {
  const [state, formAction, pending] = useActionState(startBusinessPayoutOnboarding, undefined);
  return (
    <form action={formAction}>
      <input type="hidden" name="businessId" value={businessId} />
      <p className="mutedText" style={{ marginBottom: "0.4rem" }}>
        This business hasn&apos;t enabled payouts yet — required before selling paid tickets.
      </p>
      {!hasAccount && (
        <select name="country" required defaultValue="" className="input" aria-label="Payout country" style={{ marginBottom: "0.4rem" }}>
          <option value="" disabled>
            Select payout country
          </option>
          {STRIPE_CONNECT_SUPPORTED_COUNTRIES.map((c) => (
            <option key={c.iso} value={c.iso}>
              {c.name}
            </option>
          ))}
          {PAYOUT_COUNTRY_COMING_SOON.map((c) => (
            <option key={c.iso} value={c.iso} disabled>
              {c.name}
            </option>
          ))}
        </select>
      )}
      <button type="submit" className="button buttonSecondary" disabled={pending}>
        {pending ? "Enabling…" : "Enable payouts"}
      </button>
      {state?.error && <p className="errorText">{state.error}</p>}
    </form>
  );
}

export function EventHostPanel({
  event,
  hostedByBusinessId,
  businessPayoutActive,
  businessPayoutAccountExists,
}: {
  event: EventDetails;
  hostedByBusinessId: string | null;
  businessPayoutActive: boolean;
  businessPayoutAccountExists: boolean;
}) {
  const [showEdit, setShowEdit] = useState(false);
  const [showTicketForm, setShowTicketForm] = useState(false);

  return (
    <div className="profileCard" style={{ marginTop: "1rem" }}>
      <p className="sectionHeading">Host controls</p>

      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "0.75rem" }}>
        {event.status === "draft" && (
          <form action={publishEvent}>
            <input type="hidden" name="eventId" value={event.id} />
            <button type="submit" className="button">
              Publish
            </button>
          </form>
        )}
        {event.status !== "cancelled" && (
          <form action={cancelEvent}>
            <input type="hidden" name="eventId" value={event.id} />
            <button type="submit" className="button buttonSecondary">
              Cancel event
            </button>
          </form>
        )}
        <button type="button" className="button buttonSecondary" onClick={() => setShowEdit((v) => !v)}>
          {showEdit ? "Hide edit form" : "Edit details"}
        </button>
      </div>

      {showEdit && <EditForm event={event} />}

      {hostedByBusinessId && !businessPayoutActive && (
        <div style={{ marginTop: "1rem" }}>
          <BusinessPayoutButton businessId={hostedByBusinessId} hasAccount={businessPayoutAccountExists} />
        </div>
      )}

      <div style={{ marginTop: "1rem" }}>
        <button type="button" className="button buttonSecondary" onClick={() => setShowTicketForm((v) => !v)}>
          {showTicketForm ? "Hide ticket form" : "Add ticket type"}
        </button>
        {showTicketForm && <div style={{ marginTop: "0.75rem" }}><TicketTypeForm eventId={event.id} /></div>}
      </div>

      <div style={{ marginTop: "1rem" }}>
        <p className="sectionHeading">Check in a ticket</p>
        <CheckInForm />
      </div>
    </div>
  );
}

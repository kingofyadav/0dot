"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { createEvent } from "@/app/actions/events";
import { useBrowserTab } from "@/components/BrowserTabProvider";

type HostOption = { id: string; name: string; slug: string };

export function NewEventForm({
  businesses,
  communities,
}: {
  businesses: HostOption[];
  communities: HostOption[];
}) {
  const [state, formAction, pending] = useActionState(createEvent, undefined);
  const [hostType, setHostType] = useState<"self" | "business" | "community">("self");
  const [format, setFormat] = useState<"in_person" | "virtual" | "hybrid">("in_person");
  const { flash } = useBrowserTab();
  const wasPending = useRef(false);
  // Uncontrolled + a direct ref mutation (not setState) — Intl would resolve
  // the server's timezone during SSR, not the visitor's, so this can only
  // happen client-side after mount; a controlled value={} set from state
  // populated in an effect would hydration-mismatch (empty SSR markup vs.
  // the client's immediately-set value) and trips react-hooks/set-state-in-
  // effect besides. Still just a prefill — the field stays freely editable.
  const timezoneRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (timezoneRef.current && !timezoneRef.current.value) {
      timezoneRef.current.value = Intl.DateTimeFormat().resolvedOptions().timeZone;
    }
  }, []);

  // Success redirects to the new event page before a "success" state would
  // ever render, so the transition is read off pending flipping back to
  // false rather than off a success flag.
  useEffect(() => {
    if (pending) {
      flash("saving", "Publishing event");
    } else if (wasPending.current) {
      if (state?.error) flash("error", state.error);
      else flash("success", "Event published");
    }
    wasPending.current = pending;
  }, [pending, state, flash]);

  return (
    <form action={formAction} className="authCard" style={{ maxWidth: "none" }}>
      <div className="field">
        <label htmlFor="hostType">Hosting as</label>
        <select
          id="hostType"
          name="hostType"
          value={hostType}
          onChange={(e) => setHostType(e.target.value as typeof hostType)}
        >
          <option value="self">Myself</option>
          {businesses.length > 0 && <option value="business">A business I manage</option>}
          {communities.length > 0 && <option value="community">A community I moderate</option>}
        </select>
      </div>

      {hostType === "business" && (
        <div className="field">
          <label htmlFor="hostId">Business</label>
          <select id="hostId" name="hostId" required defaultValue="">
            <option value="" disabled>
              Choose a business
            </option>
            {businesses.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {hostType === "community" && (
        <div className="field">
          <label htmlFor="hostId">Community</label>
          <select id="hostId" name="hostId" required defaultValue="">
            <option value="" disabled>
              Choose a community
            </option>
            {communities.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="field">
        <label htmlFor="title">Title</label>
        <input id="title" name="title" type="text" maxLength={160} required />
      </div>

      <div className="field">
        <label htmlFor="slug">Slug</label>
        <input
          id="slug"
          name="slug"
          type="text"
          placeholder="your_event"
          pattern="[a-zA-Z0-9_]{3,60}"
          minLength={3}
          maxLength={60}
          required
        />
        <span className="mutedText">
          <span className="brandUrl">0dot.in</span>/e/your_event — letters, numbers, and underscores only. This is permanent.
        </span>
      </div>

      <div className="field">
        <label htmlFor="description">Description</label>
        <textarea id="description" name="description" maxLength={10000} rows={5} />
      </div>

      <div className="field">
        <label htmlFor="format">Format</label>
        <select id="format" name="format" value={format} onChange={(e) => setFormat(e.target.value as typeof format)}>
          <option value="in_person">In person</option>
          <option value="virtual">Virtual</option>
          <option value="hybrid">Hybrid</option>
        </select>
      </div>

      {format !== "virtual" && (
        <div className="field">
          <label htmlFor="location">Location</label>
          <input id="location" name="location" type="text" maxLength={200} required />
        </div>
      )}

      {format !== "virtual" && (
        <div className="field" style={{ display: "flex", gap: "0.5rem" }}>
          <div style={{ flex: 1 }}>
            <label htmlFor="latitude">Latitude (optional, for the map)</label>
            <input id="latitude" name="latitude" type="text" inputMode="decimal" placeholder="e.g. 37.7749" />
          </div>
          <div style={{ flex: 1 }}>
            <label htmlFor="longitude">Longitude (optional, for the map)</label>
            <input id="longitude" name="longitude" type="text" inputMode="decimal" placeholder="e.g. -122.4194" />
          </div>
        </div>
      )}

      {format !== "in_person" && (
        <div className="field">
          <label htmlFor="virtualJoinUrl">Virtual join link</label>
          <input id="virtualJoinUrl" name="virtualJoinUrl" type="text" placeholder="https://…" maxLength={500} />
        </div>
      )}

      <div className="field">
        <label htmlFor="startsAt">Starts</label>
        <input id="startsAt" name="startsAt" type="datetime-local" required />
      </div>

      <div className="field">
        <label htmlFor="endsAt">Ends (optional)</label>
        <input id="endsAt" name="endsAt" type="datetime-local" />
      </div>

      <div className="field">
        <label htmlFor="timezone">Timezone</label>
        <input
          ref={timezoneRef}
          id="timezone"
          name="timezone"
          type="text"
          placeholder="IANA timezone, e.g. America/New_York"
          maxLength={60}
          required
        />
      </div>

      <div className="field">
        <label htmlFor="capacity">Capacity (optional)</label>
        <input id="capacity" name="capacity" type="number" min={1} />
        <span className="mutedText">Hard cap on total attendees (RSVPs + tickets). Leave blank for unlimited.</span>
      </div>

      <div className="field">
        <label htmlFor="attendeeListVisibility">Who can see the attendee list</label>
        <select id="attendeeListVisibility" name="attendeeListVisibility" defaultValue="public">
          <option value="public">Anyone</option>
          <option value="attendees_only">Attendees only</option>
          <option value="host_only">Host only</option>
        </select>
      </div>

      <div className="field">
        <label htmlFor="coverImage">Cover image</label>
        <input id="coverImage" name="coverImage" type="file" accept="image/png,image/jpeg,image/webp,image/gif" />
      </div>

      {state?.error && <p className="errorText">{state.error}</p>}

      <button type="submit" className="button" disabled={pending}>
        {pending ? "Creating…" : "Create event"}
      </button>
    </form>
  );
}

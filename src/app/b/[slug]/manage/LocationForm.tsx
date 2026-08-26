"use client";

import { useActionState, useState } from "react";
import { addLocation, updateLocation } from "@/app/actions/business-locations";
import type { BusinessHours } from "@/lib/businesses";

const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
const DAY_LABEL: Record<string, string> = {
  mon: "Mon",
  tue: "Tue",
  wed: "Wed",
  thu: "Thu",
  fri: "Fri",
  sat: "Sat",
  sun: "Sun",
};

type LocationFormLocation = {
  id: string;
  label: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  hours: BusinessHours | null;
};

// spec §3.1/§6: one open/close range per day — a scoped subset of the
// {day: [{opens, closes}]} storage shape (see business-locations.ts's
// buildHoursJson comment for why that's an honest, forward-compatible
// simplification rather than the full multi-range case).
export function LocationForm({ businessId, location }: { businessId: string; location?: LocationFormLocation }) {
  const action = location ? updateLocation : addLocation;
  const [state, formAction, pending] = useActionState(action, undefined);
  const idSuffix = location?.id ?? "new";
  const [openDays, setOpenDays] = useState<Set<string>>(
    new Set(location?.hours ? Object.keys(location.hours) : [])
  );

  function toggleDay(day: string) {
    setOpenDays((prev) => {
      const next = new Set(prev);
      if (next.has(day)) next.delete(day);
      else next.add(day);
      return next;
    });
  }

  return (
    <form action={formAction} style={{ display: "flex", flexDirection: "column", gap: "0.5rem", maxWidth: "36ch" }}>
      {location && <input type="hidden" name="locationId" value={location.id} />}
      {!location && <input type="hidden" name="businessId" value={businessId} />}
      <div className="field">
        <label htmlFor={`locLabel-${idSuffix}`}>Label</label>
        <input id={`locLabel-${idSuffix}`} name="label" defaultValue={location?.label} maxLength={100} required />
      </div>
      <div className="field">
        <label htmlFor={`locAddress-${idSuffix}`}>Address</label>
        <input id={`locAddress-${idSuffix}`} name="address" defaultValue={location?.address} maxLength={300} required />
      </div>
      <div className="fieldRow">
        <div className="field">
          <label htmlFor={`locLat-${idSuffix}`}>Latitude</label>
          <input id={`locLat-${idSuffix}`} name="latitude" type="number" step="any" defaultValue={location?.latitude ?? undefined} />
        </div>
        <div className="field">
          <label htmlFor={`locLng-${idSuffix}`}>Longitude</label>
          <input id={`locLng-${idSuffix}`} name="longitude" type="number" step="any" defaultValue={location?.longitude ?? undefined} />
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
        <span className="mutedText" style={{ fontSize: "0.85rem" }}>Hours</span>
        {DAYS.map((day) => (
          <div key={day} style={{ display: "flex", gap: "0.4rem", alignItems: "center" }}>
            <label style={{ width: "3rem", fontSize: "0.85rem", display: "inline-flex", alignItems: "center", gap: "0.25rem" }}>
              <input
                type="checkbox"
                name={`open_${day}`}
                value="true"
                checked={openDays.has(day)}
                onChange={() => toggleDay(day)}
              />
              {DAY_LABEL[day]}
            </label>
            <input
              type="time"
              name={`opens_${day}`}
              defaultValue={location?.hours?.[day]?.[0]?.opens}
              disabled={!openDays.has(day)}
              className="textInput"
              style={{ width: "auto" }}
            />
            <input
              type="time"
              name={`closes_${day}`}
              defaultValue={location?.hours?.[day]?.[0]?.closes}
              disabled={!openDays.has(day)}
              className="textInput"
              style={{ width: "auto" }}
            />
          </div>
        ))}
      </div>

      {state?.error && <p className="errorText">{state.error}</p>}
      <button type="submit" className="button" disabled={pending}>
        {pending ? "Saving…" : location ? "Save changes" : "Add location"}
      </button>
    </form>
  );
}

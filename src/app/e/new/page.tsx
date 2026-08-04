import { requireVerifiedUser } from "@/lib/auth-guards";
import { getPostableBusinesses } from "@/lib/businesses";
import { getModeratedCommunities } from "@/lib/communities";
import { NewEventForm } from "./NewEventForm";

export default async function NewEventPage() {
  const user = await requireVerifiedUser();
  const [businesses, communities] = await Promise.all([
    getPostableBusinesses(user.id),
    getModeratedCommunities(user.id),
  ]);

  return (
    <div className="profileCard">
      <h1 style={{ fontSize: "1.1rem", fontWeight: 700, marginBottom: "0.25rem" }}>Host an event</h1>
      <p className="mutedText" style={{ marginBottom: "1.25rem" }}>
        Conferences, meetups, RSVPs, and paid tickets. Starts as a draft — only you (or your
        team) can see it until you publish.
      </p>
      <NewEventForm businesses={businesses} communities={communities} />
    </div>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import { Room, RoomEvent, Track } from "livekit-client";
import { requestViewerToken } from "@/app/actions/livestreams";

// Viewer-side counterpart to LivestreamBroadcaster.tsx — subscribe-only,
// never requests camera/mic. Audio tracks are attached to a detached
// element (no visible node needed); video goes into the ref below.
export function LivestreamPlayer({ livestreamId }: { livestreamId: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let room: Room | null = null;
    let cancelled = false;

    (async () => {
      const result = await requestViewerToken(livestreamId);
      if (cancelled) return;
      if ("error" in result) {
        setError(result.error);
        return;
      }

      room = new Room();
      room.on(RoomEvent.TrackSubscribed, (track) => {
        if (track.kind === Track.Kind.Video && videoRef.current) track.attach(videoRef.current);
        else if (track.kind === Track.Kind.Audio) track.attach();
      });

      try {
        await room.connect(result.url, result.token);
      } catch {
        if (!cancelled) setError("Couldn't connect to the stream. Try refreshing the page.");
      }
    })();

    return () => {
      cancelled = true;
      void room?.disconnect();
    };
  }, [livestreamId]);

  if (error) {
    return (
      <div className="livestreamPlaceholder">
        <p className="errorText" style={{ padding: "0 1rem", textAlign: "center" }}>{error}</p>
      </div>
    );
  }

  return (
    <video
      ref={videoRef}
      autoPlay
      playsInline
      style={{ width: "100%", aspectRatio: "16/9", background: "#000", borderRadius: "12px", objectFit: "cover" }}
    />
  );
}

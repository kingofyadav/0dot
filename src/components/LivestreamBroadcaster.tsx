"use client";

import { useEffect, useRef, useState } from "react";
import { Room, Track } from "livekit-client";
import { requestBroadcastToken } from "@/app/actions/livestreams";

// Owner-side counterpart to LivestreamPlayer.tsx. setCameraEnabled/
// setMicrophoneEnabled below are what actually trigger the browser's
// camera/mic permission prompt — same getUserMedia machinery
// VoiceRoomView.tsx calls directly, just routed through LiveKit's
// LocalParticipant instead of a raw RTCPeerConnection since a livestream
// audience needs an SFU (one upload, many viewers), not the voice room's
// mesh (voice-rooms.ts's 30-participant ceiling is that mesh's actual limit).
export function LivestreamBroadcaster({ livestreamId }: { livestreamId: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let room: Room | null = null;
    let cancelled = false;

    (async () => {
      const result = await requestBroadcastToken(livestreamId);
      if (cancelled) return;
      if ("error" in result) {
        setError(result.error);
        return;
      }

      room = new Room();
      try {
        await room.connect(result.url, result.token);
        if (cancelled) return;
        await room.localParticipant.setCameraEnabled(true);
        await room.localParticipant.setMicrophoneEnabled(true);
        if (cancelled) return;

        const cameraPub = room.localParticipant.getTrackPublication(Track.Source.Camera);
        if (cameraPub?.track && videoRef.current) cameraPub.track.attach(videoRef.current);
      } catch {
        if (!cancelled) setError("Couldn't access your camera or microphone. Check your browser's site permissions and try again.");
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
      muted
      playsInline
      style={{ width: "100%", aspectRatio: "16/9", background: "#000", borderRadius: "12px", objectFit: "cover" }}
    />
  );
}

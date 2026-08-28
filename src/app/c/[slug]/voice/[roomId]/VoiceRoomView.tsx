"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Room, RoomEvent, Track } from "livekit-client";
import { Mic } from "lucide-react";
import {
  joinVoiceRoom,
  leaveVoiceRoom,
  requestToSpeak,
  cancelSpeakRequest,
  startSpeaking,
  stopSpeaking,
  forceStopSpeaker,
  requestVoiceRoomToken,
} from "@/app/actions/voice-rooms";

// Phase D (docs/specs/addendum-voice-rooms-livekit.md): audio runs on a
// LiveKit SFU room, not the old WebRTC mesh. This view still owns only the
// *client* side — the FIFO floor is all server state
// (src/app/actions/voice-rooms.ts), reflected here via the room-state SSE +
// a coalesced router.refresh(), same pattern as CommunityChatView.
//
// Only the current speaker publishes a mic track; everyone auto-subscribes.
// The server grants/revokes LiveKit publish permission as the floor moves
// (setVoicePublish), and the token itself is minted with the right
// canPublish for the current floor — so this component only has to toggle
// its own mic to match `currentSpeakerId`.

// Must match src/lib/voice-rooms.ts's MAX_FLOOR_HOLD_MS — a "server-only"
// module can't be imported into client code. The client timer is the
// normal auto-release; the server's copy is the dropped-connection fallback.
const MAX_FLOOR_HOLD_MS = 60_000;
const REFRESH_COALESCE_MS = 300;

export type VoiceParticipant = {
  userId: string;
  role: string;
  displayName: string;
};

export function VoiceRoomView({
  communitySlug,
  roomId,
  currentUserId,
  isParticipant,
  myRole,
  canSpeak,
  isStaff,
  currentSpeakerId,
  currentSpeakerName,
  participants,
  queuePosition,
  isMyTurnNext,
}: {
  communitySlug: string;
  roomId: string;
  currentUserId: string;
  isParticipant: boolean;
  myRole: string | null;
  canSpeak: boolean;
  isStaff: boolean;
  currentSpeakerId: string | null;
  currentSpeakerName: string | null;
  participants: VoiceParticipant[];
  queuePosition: number | null;
  isMyTurnNext: boolean;
}) {
  const router = useRouter();
  const [micError, setMicError] = useState<string | null>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);

  const roomRef = useRef<Room | null>(null);
  const connectedRef = useRef(false);
  const autoStopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refreshPendingRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const iAmSpeaking = currentSpeakerId === currentUserId;

  // Connect to the LiveKit room once we're a participant; disconnect on
  // leave / unmount.
  useEffect(() => {
    if (!isParticipant) return;
    let cancelled = false;
    const room = new Room();
    roomRef.current = room;

    room.on(RoomEvent.TrackSubscribed, (track) => {
      if (track.kind === Track.Kind.Audio) track.attach(); // detached <audio>, autoplay
    });
    room.on(RoomEvent.Disconnected, () => {
      connectedRef.current = false;
    });

    (async () => {
      const result = await requestVoiceRoomToken(roomId);
      if (cancelled) return;
      if ("error" in result) {
        setConnectionError(result.error);
        return;
      }
      try {
        await room.connect(result.url, result.token);
        if (cancelled) {
          void room.disconnect();
          return;
        }
        connectedRef.current = true;
        setConnectionError(null);
        // If we reconnected mid-turn, our token already carries publish —
        // turn the mic on to match the floor.
        if (currentSpeakerId === currentUserId) await enableMic(room);
      } catch {
        if (!cancelled) setConnectionError("Couldn't connect to the room's audio. Try refreshing the page.");
      }
    })();

    return () => {
      cancelled = true;
      connectedRef.current = false;
      if (autoStopTimerRef.current) clearTimeout(autoStopTimerRef.current);
      void room.disconnect();
      roomRef.current = null;
    };
    // Keyed only on isParticipant/roomId — currentSpeakerId is handled by
    // the mic-toggle effect below, re-connecting on every floor change
    // would drop everyone's audio.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isParticipant, roomId]);

  // Room-state SSE — a coalesced router.refresh() on any `room-updated` so
  // the server-rendered props (participants / queue / speaker) stay current.
  useEffect(() => {
    if (!isParticipant) return;
    const source = new EventSource(`/api/c/${communitySlug}/voice/${roomId}/stream`);
    source.onmessage = () => {
      if (refreshPendingRef.current) return;
      refreshPendingRef.current = setTimeout(() => {
        refreshPendingRef.current = null;
        router.refresh();
      }, REFRESH_COALESCE_MS);
    };
    return () => {
      source.close();
      if (refreshPendingRef.current) clearTimeout(refreshPendingRef.current);
    };
  }, [isParticipant, communitySlug, roomId, router]);

  async function enableMic(room: Room) {
    try {
      await room.localParticipant.setMicrophoneEnabled(true);
      setMicError(null);
      if (autoStopTimerRef.current) clearTimeout(autoStopTimerRef.current);
      autoStopTimerRef.current = setTimeout(() => {
        const fd = new FormData();
        fd.set("voiceRoomId", roomId);
        void stopSpeaking(fd);
      }, MAX_FLOOR_HOLD_MS);
    } catch {
      setMicError("Couldn't access your microphone. Check your browser's site permissions.");
      const fd = new FormData();
      fd.set("voiceRoomId", roomId);
      void stopSpeaking(fd);
    }
  }

  // Toggle the local mic to follow the floor. The server has already
  // granted/revoked the LiveKit publish permission; this is the local
  // capture side.
  useEffect(() => {
    const room = roomRef.current;
    if (!room || !connectedRef.current) return;
    if (iAmSpeaking) {
      void enableMic(room);
    } else {
      void room.localParticipant.setMicrophoneEnabled(false);
      if (autoStopTimerRef.current) {
        clearTimeout(autoStopTimerRef.current);
        autoStopTimerRef.current = null;
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [iAmSpeaking]);

  function actionForm(action: (formData: FormData) => Promise<void>) {
    return async () => {
      const formData = new FormData();
      formData.set("voiceRoomId", roomId);
      await action(formData);
    };
  }

  if (!isParticipant) {
    return (
      <button type="button" className="button" onClick={() => void actionForm(joinVoiceRoom)()}>
        Join room
      </button>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <div className="profileLinkItem" style={{ flexDirection: "column", alignItems: "flex-start", gap: "0.3rem" }}>
        {currentSpeakerId ? (
          <span style={{ display: "inline-flex", alignItems: "center", gap: "0.3rem" }}>
            <Mic size={14} aria-hidden="true" /> <strong>{iAmSpeaking ? "You" : currentSpeakerName}</strong> {iAmSpeaking ? "are" : "is"}{" "}
            speaking
          </span>
        ) : (
          <span className="mutedText">The floor is free.</span>
        )}
      </div>

      {micError && <p className="errorText">{micError}</p>}
      {connectionError && <p className="errorText">{connectionError}</p>}

      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
        {myRole === "listener" && canSpeak && (
          <button type="button" className="button buttonSecondary" onClick={() => void actionForm(requestToSpeak)()}>
            Request to speak
          </button>
        )}
        {myRole === "requesting_to_speak" && (
          <>
            <span className="mutedText" style={{ alignSelf: "center", fontSize: "0.85rem" }}>
              {isMyTurnNext ? "It's your turn" : `#${queuePosition} in line`}
            </span>
            {isMyTurnNext && (
              <button type="button" className="button" onClick={() => void actionForm(startSpeaking)()}>
                Start speaking
              </button>
            )}
            <button type="button" className="button buttonSecondary" onClick={() => void actionForm(cancelSpeakRequest)()}>
              Cancel request
            </button>
          </>
        )}
        {iAmSpeaking && (
          <button type="button" className="button buttonDanger" onClick={() => void actionForm(stopSpeaking)()}>
            Stop speaking
          </button>
        )}
        {isStaff && currentSpeakerId && !iAmSpeaking && (
          <button type="button" className="button buttonDanger" onClick={() => void actionForm(forceStopSpeaker)()}>
            Force stop speaker
          </button>
        )}
        <button type="button" className="button buttonSecondary" onClick={() => void actionForm(leaveVoiceRoom)()}>
          Leave room
        </button>
      </div>

      <div>
        <p className="sectionHeading">In this room ({participants.length})</p>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
          {participants.map((p) => (
            <div key={p.userId} style={{ display: "flex", gap: "0.5rem", alignItems: "center", fontSize: "0.85rem" }}>
              {p.userId === currentSpeakerId && "🎙"}
              {p.role === "requesting_to_speak" && "✋"}
              <span>{p.userId === currentUserId ? "You" : p.displayName}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

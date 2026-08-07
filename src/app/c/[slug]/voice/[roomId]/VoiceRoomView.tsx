"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  joinVoiceRoom,
  leaveVoiceRoom,
  requestToSpeak,
  cancelSpeakRequest,
  startSpeaking,
  stopSpeaking,
  forceStopSpeaker,
  sendVoiceSignal,
} from "@/app/actions/voice-rooms";

// Must match src/lib/voice-rooms.ts's MAX_FLOOR_HOLD_MS — can't import a
// "server-only" module into client code, so this is a duplicated constant,
// not a shared one. The client-side timer is the normal release path; the
// server's copy is only a fallback for a dropped connection.
const MAX_FLOOR_HOLD_MS = 60_000;
const REFRESH_COALESCE_MS = 300; // same coalescing posture as MessagingProvider/CommunityChatView

// No TURN server — a known limitation (see the plan/spec comment), not an
// oversight: participants behind a symmetric NAT or restrictive corporate
// firewall may fail to connect. STUN-only is enough for typical home/office
// networks. Overridable via NEXT_PUBLIC_VOICE_STUN_URLS (comma-separated)
// for deployments that add their own STUN/TURN later.
const STUN_URLS = (process.env.NEXT_PUBLIC_VOICE_STUN_URLS ?? "stun:stun.l.google.com:19302").split(",");
const ICE_SERVERS: RTCIceServer[] = [{ urls: STUN_URLS }];

type SignalPayload =
  | { kind: "offer"; sdp: RTCSessionDescriptionInit }
  | { kind: "answer"; sdp: RTCSessionDescriptionInit }
  | { kind: "ice"; candidate: RTCIceCandidateInit };

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
  const [isBroadcasting, setIsBroadcasting] = useState(false);

  const remoteAudioRef = useRef<HTMLAudioElement>(null);
  const peerConnectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const localStreamRef = useRef<MediaStream | null>(null);
  const knownParticipantIdsRef = useRef<Set<string>>(new Set());
  const prevSpeakerIdRef = useRef<string | null>(null);
  const autoStopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refreshPendingRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function sendSignalToServer(targetUserId: string, payload: SignalPayload) {
    const formData = new FormData();
    formData.set("voiceRoomId", roomId);
    formData.set("targetUserId", targetUserId);
    formData.set("payload", JSON.stringify(payload));
    void sendVoiceSignal(formData);
  }

  function closePeer(peerId: string) {
    peerConnectionsRef.current.get(peerId)?.close();
    peerConnectionsRef.current.delete(peerId);
  }

  function closeAllPeers() {
    for (const pc of peerConnectionsRef.current.values()) pc.close();
    peerConnectionsRef.current.clear();
  }

  async function connectToPeer(peerId: string, stream: MediaStream) {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    stream.getTracks().forEach((track) => pc.addTrack(track, stream));
    pc.onicecandidate = (e) => {
      if (e.candidate) sendSignalToServer(peerId, { kind: "ice", candidate: e.candidate.toJSON() });
    };
    peerConnectionsRef.current.set(peerId, pc);

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    sendSignalToServer(peerId, { kind: "offer", sdp: offer });
  }

  async function startBroadcasting() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      localStreamRef.current = stream;
      setIsBroadcasting(true);
      setMicError(null);

      const others = participants.filter((p) => p.userId !== currentUserId);
      knownParticipantIdsRef.current = new Set(others.map((p) => p.userId));
      await Promise.all(others.map((p) => connectToPeer(p.userId, stream)));

      autoStopTimerRef.current = setTimeout(() => {
        const formData = new FormData();
        formData.set("voiceRoomId", roomId);
        void stopSpeaking(formData);
      }, MAX_FLOOR_HOLD_MS);
    } catch {
      setMicError("Couldn't access your microphone.");
      const formData = new FormData();
      formData.set("voiceRoomId", roomId);
      void stopSpeaking(formData);
    }
  }

  function stopBroadcasting() {
    closeAllPeers();
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    setIsBroadcasting(false);
    if (autoStopTimerRef.current) {
      clearTimeout(autoStopTimerRef.current);
      autoStopTimerRef.current = null;
    }
  }

  function cleanupListening() {
    closeAllPeers();
    if (remoteAudioRef.current) remoteAudioRef.current.srcObject = null;
  }

  async function handleSignal(from: string, payload: SignalPayload) {
    if (payload.kind === "offer") {
      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      pc.ontrack = (e) => {
        if (remoteAudioRef.current) remoteAudioRef.current.srcObject = e.streams[0];
      };
      pc.onicecandidate = (e) => {
        if (e.candidate) sendSignalToServer(from, { kind: "ice", candidate: e.candidate.toJSON() });
      };
      peerConnectionsRef.current.set(from, pc);
      await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      sendSignalToServer(from, { kind: "answer", sdp: answer });
    } else if (payload.kind === "answer") {
      await peerConnectionsRef.current.get(from)?.setRemoteDescription(new RTCSessionDescription(payload.sdp));
    } else if (payload.kind === "ice") {
      await peerConnectionsRef.current.get(from)?.addIceCandidate(new RTCIceCandidate(payload.candidate));
    }
  }

  // SSE subscription — only once we're a participant (the stream route is
  // participant-gated, see its comment). Signaling is handled directly
  // here; room-state changes (participants/queue/speaker) trigger a
  // coalesced router.refresh() so the server-rendered props below stay
  // current, same pattern as CommunityChatView.
  useEffect(() => {
    if (!isParticipant) return;
    const source = new EventSource(`/api/c/${communitySlug}/voice/${roomId}/stream`);
    source.onmessage = (e) => {
      const event = JSON.parse(e.data) as { type: "room-updated" } | { type: "signal"; from: string; payload: SignalPayload };
      if (event.type === "signal") {
        void handleSignal(event.from, event.payload);
        return;
      }
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- handleSignal closes over refs, not state; re-subscribing on every participant-list change would thrash the connection
  }, [isParticipant, communitySlug, roomId, router]);

  // Reacts to the floor changing (a fresh currentSpeakerId prop after a
  // router.refresh()) — this is where actual WebRTC connections get
  // opened/closed, independent of the SSE effect above so a room-state
  // refresh never tears down an in-progress audio connection by accident.
  useEffect(() => {
    const prevSpeaker = prevSpeakerIdRef.current;

    if (currentSpeakerId === prevSpeaker) {
      // No speaker transition — but if I'm currently broadcasting, the
      // participant list may have changed: a new listener joined mid-turn
      // (needs a fresh connection) or one left (their now-dangling
      // connection needs closing).
      if (isBroadcasting && localStreamRef.current) {
        const currentIds = new Set(participants.filter((p) => p.userId !== currentUserId).map((p) => p.userId));
        for (const id of currentIds) {
          if (!knownParticipantIdsRef.current.has(id)) void connectToPeer(id, localStreamRef.current);
        }
        for (const id of knownParticipantIdsRef.current) {
          if (!currentIds.has(id)) closePeer(id);
        }
        knownParticipantIdsRef.current = currentIds;
      }
      return;
    }
    prevSpeakerIdRef.current = currentSpeakerId;

    if (prevSpeaker === currentUserId) stopBroadcasting();
    else cleanupListening();

    // Deliberate: this effect exists specifically to synchronize with an
    // external system (mic capture + WebRTC) when the server tells us the
    // floor changed hands — there's no pure-render alternative, same class
    // of unavoidable case MessageBubble.tsx's clock-format effect already
    // has a precedent for in this codebase.
    if (currentSpeakerId === currentUserId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- startBroadcasting's setState calls happen after an await (mic permission), not synchronously; the lint rule can't see through that
      void startBroadcasting();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deliberately keyed only on currentSpeakerId; participants/isBroadcasting are read fresh via refs/closures, re-running on every prop change would restart connections
  }, [currentSpeakerId]);

  // Leaving the room (the button below, or getting removed) doesn't unmount
  // this component — it just flips isParticipant and re-renders the "Join
  // room" branch below, which renders no <audio> element at all. Without
  // this, the RTCPeerConnection(s) in peerConnectionsRef keep running
  // regardless: a listener who left keeps *receiving* the current speaker's
  // audio (just with nowhere visible to play it) until they navigate away
  // entirely, and a speaker who left without stopping first keeps
  // broadcasting their mic. The speaker-transition effect below only reacts
  // to currentSpeakerId changing, which "I left" alone doesn't necessarily
  // trigger, so this needs its own effect keyed on isParticipant.
  useEffect(() => {
    if (isParticipant) return;
    closeAllPeers();
    if (remoteAudioRef.current) remoteAudioRef.current.srcObject = null;
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    // Same justified case as startBroadcasting's disable below: this effect
    // exists specifically to synchronize React state with the external
    // WebRTC/mic system when the server tells us we've left, not to derive
    // state from props/state React already has.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsBroadcasting(false);
    if (autoStopTimerRef.current) {
      clearTimeout(autoStopTimerRef.current);
      autoStopTimerRef.current = null;
    }
  }, [isParticipant]);

  // Full teardown on unmount (navigating away, closing the tab).
  useEffect(() => {
    return () => {
      closeAllPeers();
      localStreamRef.current?.getTracks().forEach((t) => t.stop());
      if (autoStopTimerRef.current) clearTimeout(autoStopTimerRef.current);
    };
  }, []);

  function actionForm(action: (formData: FormData) => Promise<void>) {
    return async () => {
      const formData = new FormData();
      formData.set("voiceRoomId", roomId);
      await action(formData);
    };
  }

  if (!isParticipant) {
    return (
      <button
        type="button"
        className="button"
        onClick={() => {
          void actionForm(joinVoiceRoom)();
        }}
      >
        Join room
      </button>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <audio ref={remoteAudioRef} autoPlay />

      <div className="profileLinkItem" style={{ flexDirection: "column", alignItems: "flex-start", gap: "0.3rem" }}>
        {currentSpeakerId ? (
          <span>
            🎙 <strong>{currentSpeakerId === currentUserId ? "You" : currentSpeakerName}</strong> {currentSpeakerId === currentUserId ? "are" : "is"} speaking
          </span>
        ) : (
          <span className="mutedText">The floor is free.</span>
        )}
      </div>

      {micError && <p className="errorText">{micError}</p>}

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
        {currentSpeakerId === currentUserId && (
          <button type="button" className="button buttonDanger" onClick={() => void actionForm(stopSpeaking)()}>
            Stop speaking
          </button>
        )}
        {isStaff && currentSpeakerId && currentSpeakerId !== currentUserId && (
          <button type="button" className="button buttonDanger" onClick={() => void actionForm(forceStopSpeaker)()}>
            Force stop speaker
          </button>
        )}
        <button type="button" className="button buttonSecondary" onClick={() => void actionForm(leaveVoiceRoom)()}>
          Leave room
        </button>
      </div>

      <div>
        <p className="sectionHeading">
          In this room ({participants.length})
        </p>
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

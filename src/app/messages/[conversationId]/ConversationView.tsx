"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { sendMessage, deleteMessage } from "@/app/actions/messages";
import { MessageBubble, type MessageBubbleData } from "@/components/MessageBubble";

// phase-2 spec §5.3's voice-note duration cap suggestion ("recommend 2
// minutes as a starting point") — a UX/product cap, not architectural;
// recording auto-stops here rather than being rejected server-side.
const MAX_VOICE_NOTE_SECONDS = 120;

const ATTACHMENT_FILE_ACCEPT = "image/png,image/jpeg,image/webp,image/gif,application/pdf,text/plain";

type PendingAttachment = { file: File; kind: "file" | "voice_note"; durationS: number | null };

// Messages are seeded from the server-rendered initial page and resynced
// whenever it changes (e.g. MessagingProvider's router.refresh() on an SSE
// event from another participant) — see that component's comment for why
// this is a full-tree refresh rather than fine-grained client patching.
// A message *I* just sent is appended immediately from sendMessage's own
// return value, without waiting for a refresh (there is none coming: the
// SSE publish only reaches other participants, not the sender's own tab).
export function ConversationView({
  conversationId,
  currentUserId,
  initialMessages,
  canReply,
}: {
  conversationId: string;
  currentUserId: string;
  initialMessages: MessageBubbleData[];
  canReply: boolean;
}) {
  // React's documented "adjusting state when a prop changes" pattern
  // (react.dev/learn/you-might-not-need-an-effect) — setState during render,
  // guarded by a reference comparison, rather than in a useEffect (which
  // would cause an extra visible re-render pass and trips
  // react-hooks/set-state-in-effect). Bails out after one immediate re-run
  // when initialMessages actually changes, not on every render.
  const [prevInitialMessages, setPrevInitialMessages] = useState(initialMessages);
  const [messages, setMessages] = useState(initialMessages);
  if (initialMessages !== prevInitialMessages) {
    setPrevInitialMessages(initialMessages);
    setMessages(initialMessages);
  }

  const [body, setBody] = useState("");
  const [pendingAttachment, setPendingAttachment] = useState<PendingAttachment | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const listRef = useRef<HTMLDivElement>(null);

  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages]);

  // Stop any in-progress recording/timer if the user navigates away mid-recording.
  useEffect(() => {
    return () => {
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
      mediaRecorderRef.current?.stream.getTracks().forEach((t) => t.stop());
    };
  }, []);

  function stopRecordingTimer() {
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
  }

  async function startRecording() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "audio/mp4";
      const recorder = new MediaRecorder(stream, { mimeType });
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        stopRecordingTimer();
        setIsRecording(false);
        setRecordingSeconds((seconds) => {
          const blob = new Blob(chunksRef.current, { type: mimeType });
          const ext = mimeType === "audio/webm" ? "webm" : "mp4";
          const file = new File([blob], `voice-note.${ext}`, { type: mimeType });
          setPendingAttachment({ file, kind: "voice_note", durationS: seconds });
          return seconds;
        });
      };

      mediaRecorderRef.current = recorder;
      setPendingAttachment(null);
      setRecordingSeconds(0);
      setIsRecording(true);
      recorder.start();

      recordingTimerRef.current = setInterval(() => {
        setRecordingSeconds((s) => {
          if (s + 1 >= MAX_VOICE_NOTE_SECONDS) {
            mediaRecorderRef.current?.stop();
          }
          return s + 1;
        });
      }, 1000);
    } catch {
      setError("Couldn't access your microphone.");
    }
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop();
  }

  function handleDelete(messageId: string) {
    // Optimistic tombstone — matches the local-state-update posture
    // handleSubmit already uses for a just-sent message; other participants'
    // open tabs pick up the real change via deleteMessage's SSE publish +
    // router.refresh() (MessagingProvider), same as any other live update.
    setMessages((prev) =>
      prev.map((m) =>
        m.id === messageId
          ? {
              ...m,
              body: null,
              attachmentType: null,
              attachmentUrl: null,
              attachmentMimeType: null,
              attachmentDurationS: null,
              deletedAt: new Date(),
            }
          : m
      )
    );
    startTransition(async () => {
      const formData = new FormData();
      formData.set("messageId", messageId);
      await deleteMessage(formData);
    });
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setPendingAttachment({ file, kind: "file", durationS: null });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = body.trim();
    if ((!trimmed && !pendingAttachment) || isPending || isRecording) return;

    const formData = new FormData();
    formData.set("conversationId", conversationId);
    formData.set("body", trimmed);
    if (pendingAttachment) {
      formData.set("attachment", pendingAttachment.file);
      formData.set("attachmentKind", pendingAttachment.kind);
      if (pendingAttachment.durationS !== null) {
        formData.set("attachmentDurationS", String(pendingAttachment.durationS));
      }
    }

    startTransition(async () => {
      const result = await sendMessage(formData);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setError(null);
      setBody("");
      setPendingAttachment(null);
      setMessages((prev) => [...prev, result.message]);
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div ref={listRef} role="log" aria-live="polite" aria-label="Messages" className="messageList">
        {messages.length === 0 && <p className="mutedText">No messages yet — say hello.</p>}
        {messages.map((message) => (
          <MessageBubble
            key={message.id}
            message={message}
            isOwn={message.senderId === currentUserId}
            onDelete={message.senderId === currentUserId ? handleDelete : undefined}
          />
        ))}
      </div>

      {canReply ? (
        <form onSubmit={handleSubmit} className="messageComposer" style={{ flexDirection: "column", alignItems: "stretch" }}>
          {pendingAttachment && (
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.4rem" }}>
              <span className="mutedText" style={{ fontSize: "0.8rem" }}>
                {pendingAttachment.kind === "voice_note"
                  ? `🎤 Voice note (${pendingAttachment.durationS ?? 0}s)`
                  : `📎 ${pendingAttachment.file.name}`}
              </span>
              <button
                type="button"
                className="button buttonSecondary iconButton"
                onClick={() => setPendingAttachment(null)}
                aria-label="Remove attachment"
                style={{ fontSize: "0.75rem" }}
              >
                ✕
              </button>
            </div>
          )}
          {isRecording && (
            <p className="mutedText" style={{ fontSize: "0.8rem", marginBottom: "0.4rem" }}>
              🔴 Recording… {recordingSeconds}s
            </p>
          )}
          <div style={{ display: "flex", alignItems: "flex-end", gap: "0.5rem" }}>
            <label className="button buttonSecondary iconButton" aria-label="Attach file" style={{ cursor: isRecording ? "not-allowed" : "pointer" }}>
              📎
              <input
                type="file"
                accept={ATTACHMENT_FILE_ACCEPT}
                onChange={handleFileChange}
                disabled={isRecording}
                style={{ display: "none" }}
              />
            </label>
            <button
              type="button"
              className={`button buttonSecondary iconButton${isRecording ? " buttonDanger" : ""}`}
              aria-label={isRecording ? "Stop recording" : "Record a voice note"}
              onClick={isRecording ? stopRecording : startRecording}
            >
              {isRecording ? "⏹" : "🎤"}
            </button>
            <label htmlFor="message-composer-input" className="srOnly">
              Message
            </label>
            <textarea
              id="message-composer-input"
              className="textInput"
              rows={1}
              placeholder="Write a message…"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit(e);
                }
              }}
              maxLength={4000}
            />
            <button type="submit" className="button" disabled={isPending || (body.trim().length === 0 && !pendingAttachment)}>
              {isPending ? "Sending…" : "Send"}
            </button>
          </div>
        </form>
      ) : (
        <p className="mutedText" style={{ padding: "0.75rem 0" }}>
          Accept this conversation request to reply.
        </p>
      )}
      {error && <p className="errorText">{error}</p>}
    </div>
  );
}

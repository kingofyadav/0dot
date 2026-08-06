"use client";

import { useRef, useState } from "react";
import { MoreHorizontal, Trash2, X } from "lucide-react";
import { deleteConversation } from "@/app/actions/messages";
import { Modal } from "@/components/Modal";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// "Delete chat" control for an inbox row or an open conversation's header —
// same ⋯-trigger + destructive-confirm-modal shape as PostOwnerMenu
// (progressive disclosure for a one-off destructive action, UX_GUIDELINES.md
// #6/#9). Calls deleteConversation (actions/messages.ts), which only flips
// this participant's hiddenAt — the conversation stays intact for anyone
// else in it and comes back to this inbox if a new message arrives, so the
// confirmation copy says exactly that instead of implying permanent deletion.
export function ConversationRowMenu({
  conversationId,
  compact = false,
}: {
  conversationId: string;
  // Inbox-row usage: invisible until hovered (progressive disclosure amid a
  // dense list). The conversation header instead passes compact=false to
  // stay a plain, always-visible header icon button.
  compact?: boolean;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className={`button buttonSecondary iconButton${compact ? " conversationRowMenuTriggerCompact" : ""}`}
            aria-label="Conversation options"
            onClick={(e) => e.stopPropagation()}
          >
            <MoreHorizontal size={16} aria-hidden="true" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem variant="destructive" onSelect={() => setConfirmOpen(true)}>
            <Trash2 size={14} aria-hidden="true" />
            Delete chat
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <form ref={formRef} action={deleteConversation} style={{ display: "none" }} aria-hidden="true">
        <input type="hidden" name="conversationId" value={conversationId} />
      </form>

      <Modal open={confirmOpen} onClose={() => setConfirmOpen(false)} title="Delete this chat?">
        <p>
          This removes it from your inbox. The other participant keeps their copy, and it comes back here
          automatically if a new message arrives.
        </p>
        <div className="modalActions">
          <button type="button" className="button buttonSecondary" onClick={() => setConfirmOpen(false)}>
            <X size={16} aria-hidden="true" />
            Cancel
          </button>
          <button
            type="button"
            className="button buttonDanger"
            onClick={() => {
              setConfirmOpen(false);
              formRef.current?.requestSubmit();
            }}
          >
            <Trash2 size={16} aria-hidden="true" />
            Delete
          </button>
        </div>
      </Modal>
    </>
  );
}

"use client";

import { useActionState, useRef, useState } from "react";
import { Trash2, X } from "lucide-react";
import { editPost, deletePost } from "@/app/actions/posts";
import { Modal } from "@/components/Modal";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// Consolidates the owner-only Edit/Delete controls behind one "⋯" trigger
// (UX_GUIDELINES.md #6: progressive disclosure for owner-only features)
// instead of two permanently-visible icon buttons. Delete gets a second,
// explicit confirmation step (UX_GUIDELINES.md #9) — the one destructive,
// irreversible-from-the-UI action here; Edit doesn't need one, it's freely
// re-editable. Both live in one client component (rather than reusing the
// old EditPostForm/plain-submit-button split) because DropdownMenuContent
// renders through a Radix portal — a submit button placed inside it would
// no longer sit inside the enclosing <form>, breaking the
// ConfirmButton-style "ref.current.form" pattern used elsewhere. A hidden
// form + ref, submitted programmatically, sidesteps that.
export function PostOwnerMenu({ postId, body }: { postId: string; body: string }) {
  const [editOpen, setEditOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [editState, editAction, editPending] = useActionState(editPost, undefined);
  const deleteFormRef = useRef<HTMLFormElement>(null);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" className="button buttonSecondary iconButton" aria-label="Post options">
            ⋯
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setEditOpen(true)}>Edit</DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onSelect={() => setDeleteConfirmOpen(true)}>
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <form ref={deleteFormRef} action={deletePost} style={{ display: "none" }} aria-hidden="true">
        <input type="hidden" name="postId" value={postId} />
      </form>

      <Modal open={editOpen} onClose={() => setEditOpen(false)} title="Edit post">
        <form
          action={async (formData: FormData) => {
            await editAction(formData);
            setEditOpen(false);
          }}
          style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}
        >
          <input type="hidden" name="postId" value={postId} />
          <textarea name="body" defaultValue={body} maxLength={500} rows={4} required className="textInput" />
          {editState?.error && <p className="errorText">{editState.error}</p>}
          <div className="modalActions">
            <button type="button" className="button buttonSecondary" onClick={() => setEditOpen(false)}>
              Cancel
            </button>
            <button type="submit" className="button" disabled={editPending}>
              {editPending ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      </Modal>

      <Modal open={deleteConfirmOpen} onClose={() => setDeleteConfirmOpen(false)} title="Delete this post?">
        <p>This can&apos;t be undone. The post, its likes, and its replies will be permanently removed.</p>
        <div className="modalActions">
          <button type="button" className="button buttonSecondary" onClick={() => setDeleteConfirmOpen(false)}>
            <X size={16} aria-hidden="true" />
            Cancel
          </button>
          <button
            type="button"
            className="button buttonDanger"
            onClick={() => {
              setDeleteConfirmOpen(false);
              deleteFormRef.current?.requestSubmit();
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

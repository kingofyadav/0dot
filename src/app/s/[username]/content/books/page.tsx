import Link from "next/link";
import { redirect } from "next/navigation";
import { Book as BookIcon, FileText, Pencil, Plus, X } from "lucide-react";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { listAllBookChapters } from "@/lib/wiki";
import { deleteBook } from "@/app/actions/books";
import { deleteBookChapter } from "@/app/actions/knowledge-pages";
import { SettingsRow } from "@/components/SettingsRow";
import { EmptyState } from "@/components/EmptyState";
import { BookForm } from "../../BookForm";
import { BookChapterForm } from "../../BookChapterForm";

export default async function BooksSettingsPage() {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/login");
  if (!currentUser.profile) redirect("/claim-username");

  const myBooks = await db.book.findMany({
    where: { profileId: currentUser.profile.id },
    orderBy: { createdAt: "desc" },
  });
  const chaptersByBook = new Map(
    await Promise.all(myBooks.map(async (book) => [book.id, await listAllBookChapters(book.id)] as const))
  );
  const chapterBodyById = new Map<string, string>();
  for (const chapters of chaptersByBook.values()) {
    const withBody = await db.wikiPage.findMany({
      where: { id: { in: chapters.map((c) => c.id) } },
      include: { currentRevision: { select: { body: true } } },
    });
    for (const c of withBody) chapterBodyById.set(c.id, c.currentRevision?.body ?? "");
  }

  return (
    <div className="settingsSection">
      <h2 className="settingsSectionHeading">Books</h2>
      {myBooks.length === 0 && <EmptyState message="No books yet." />}
      {myBooks.map((book) => {
        const chapters = chaptersByBook.get(book.id) ?? [];
        return (
          <div key={book.id} id={`book-${book.id}`} className="settingsGroup" style={{ marginBottom: "var(--space-3)" }}>
            <SettingsRow
              icon={BookIcon}
              label={book.title}
              description={`${book.status} · ${book.visibility}`}
              trailing={
                <>
                  {currentUser.username && (
                    <Link href={`/${currentUser.username.handle}/books/${book.slug}`} className="button buttonSecondary buttonSmall">View</Link>
                  )}
                  <form action={deleteBook}>
                    <input type="hidden" name="bookId" value={book.id} />
                    <button type="submit" className="button buttonSecondary buttonSmall">Delete</button>
                  </form>
                </>
              }
            />

            {chapters.map((chapter) => (
              <SettingsRow
                key={chapter.id}
                icon={FileText}
                label={`${chapter.parentPageId ? "— " : ""}${chapter.title}`}
                trailing={
                  <form action={deleteBookChapter}>
                    <input type="hidden" name="pageId" value={chapter.id} />
                    <button type="submit" className="button buttonSecondary iconButton" aria-label="Delete chapter"><X size={16} aria-hidden="true" /></button>
                  </form>
                }
              />
            ))}

            <details>
              <summary className="settingsRow settingsAddTrigger">
                <span className="settingsRowIcon" aria-hidden="true">
                  <Pencil size={16} />
                </span>
                <span className="settingsRowText">
                  <span className="settingsRowLabel">Edit chapters</span>
                </span>
              </summary>
              <div className="settingsAddPanelBody" style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
                {chapters.map((chapter) => (
                  <details key={chapter.id} className="settingsGroup">
                    <summary className="settingsRow settingsAddTrigger">
                      <span className="settingsRowText">
                        <span className="settingsRowLabel">{chapter.title}</span>
                      </span>
                    </summary>
                    <div className="settingsAddPanelBody">
                      <BookChapterForm
                        bookId={book.id}
                        chapter={{ ...chapter, body: chapterBodyById.get(chapter.id) ?? "", visibility: chapter.visibility ?? "public" }}
                        otherChapters={chapters.map((c) => ({ id: c.id, title: c.title }))}
                      />
                    </div>
                  </details>
                ))}
                <details className="settingsGroup">
                  <summary className="settingsRow settingsAddTrigger">
                    <span className="settingsRowIcon" aria-hidden="true">
                      <Plus size={18} />
                    </span>
                    <span className="settingsRowText">
                      <span className="settingsRowLabel">Add chapter</span>
                    </span>
                  </summary>
                  <div className="settingsAddPanelBody">
                    <BookChapterForm bookId={book.id} otherChapters={chapters.map((c) => ({ id: c.id, title: c.title }))} />
                  </div>
                </details>
              </div>
            </details>

            <details>
              <summary className="settingsRow settingsAddTrigger">
                <span className="settingsRowIcon" aria-hidden="true">
                  <Pencil size={16} />
                </span>
                <span className="settingsRowText">
                  <span className="settingsRowLabel">Edit details</span>
                </span>
              </summary>
              <div className="settingsAddPanelBody">
                <BookForm book={book} />
              </div>
            </details>
          </div>
        );
      })}
      <details className="settingsGroup">
        <summary className="settingsRow settingsAddTrigger">
          <span className="settingsRowIcon" aria-hidden="true">
            <Plus size={18} />
          </span>
          <span className="settingsRowText">
            <span className="settingsRowLabel">Create a book</span>
          </span>
        </summary>
        <div className="settingsAddPanelBody">
          <BookForm />
        </div>
      </details>
    </div>
  );
}

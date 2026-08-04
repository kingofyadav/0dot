import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { listAllBookChapters } from "@/lib/wiki";
import { deleteBook } from "@/app/actions/books";
import { deleteBookChapter } from "@/app/actions/knowledge-pages";
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
      {myBooks.length === 0 && <p className="mutedText">No books yet.</p>}
      {myBooks.map((book) => {
        const chapters = chaptersByBook.get(book.id) ?? [];
        return (
          <div key={book.id} id={`book-${book.id}`} className="profileLinkItem" style={{ flexDirection: "column", alignItems: "stretch", gap: "0.35rem", marginBottom: "0.5rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span>
                <strong>{book.title}</strong>{" "}
                <span className="mutedText">{book.status} · {book.visibility}</span>
              </span>
              <span style={{ display: "flex", gap: "0.35rem" }}>
                {currentUser.username && (
                  <Link href={`/${currentUser.username.handle}/books/${book.slug}`} className="button buttonSecondary buttonSmall">View</Link>
                )}
                <form action={deleteBook}>
                  <input type="hidden" name="bookId" value={book.id} />
                  <button type="submit" className="button buttonSecondary buttonSmall">Delete</button>
                </form>
              </span>
            </div>

            {chapters.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.2rem" }}>
                {chapters.map((chapter) => (
                  <div key={chapter.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span className="mutedText" style={{ fontSize: "0.85rem" }}>
                      {chapter.parentPageId ? "— " : ""}{chapter.title}
                    </span>
                    <form action={deleteBookChapter}>
                      <input type="hidden" name="pageId" value={chapter.id} />
                      <button type="submit" className="button buttonSecondary iconButton" aria-label="Delete chapter">✕</button>
                    </form>
                  </div>
                ))}
              </div>
            )}

            <details className="profileEditToggle">
              <summary className="mutedText" style={{ fontSize: "0.85rem" }}>Edit chapters</summary>
              <div style={{ marginTop: "0.5rem", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                {chapters.map((chapter) => (
                  <details key={chapter.id} className="profileEditToggle">
                    <summary className="mutedText" style={{ fontSize: "0.8rem" }}>{chapter.title}</summary>
                    <div style={{ marginTop: "0.4rem" }}>
                      <BookChapterForm
                        bookId={book.id}
                        chapter={{ ...chapter, body: chapterBodyById.get(chapter.id) ?? "", visibility: chapter.visibility ?? "public" }}
                        otherChapters={chapters.map((c) => ({ id: c.id, title: c.title }))}
                      />
                    </div>
                  </details>
                ))}
                <details className="profileEditToggle">
                  <summary>Add chapter</summary>
                  <div style={{ marginTop: "0.4rem" }}>
                    <BookChapterForm bookId={book.id} otherChapters={chapters.map((c) => ({ id: c.id, title: c.title }))} />
                  </div>
                </details>
              </div>
            </details>

            <details className="profileEditToggle">
              <summary className="mutedText" style={{ fontSize: "0.85rem" }}>Edit details</summary>
              <div style={{ marginTop: "0.5rem" }}>
                <BookForm book={book} />
              </div>
            </details>
          </div>
        );
      })}
      <details className="profileEditToggle" style={{ marginTop: "0.5rem" }}>
        <summary>Create a book</summary>
        <div style={{ marginTop: "0.5rem" }}>
          <BookForm />
        </div>
      </details>
    </div>
  );
}

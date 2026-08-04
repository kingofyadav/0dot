import "server-only";
import { db } from "@/lib/db";

// phase-6 spec §5.2/§5.4: public repository metadata (stars, description,
// primary language) is fetched from each provider's public API and cached
// on GitRepository, refreshed on a periodic interval — never synchronously
// on a profile view. Mirrors src/lib/trending.ts's scheduler shape exactly
// (module-scope setInterval, globalThis re-entry guard, in-flight-promise
// guard) since that's the one periodic-job precedent this codebase already
// has; this is the first *daily*-cadence job, not the first periodic one.
const SYNC_INTERVAL_MS = 24 * 60 * 60 * 1000; // daily, per spec §5.2's "e.g. daily"
const FETCH_TIMEOUT_MS = 8000;

function parseGithubPath(url: string): string | null {
  const match = url.match(/^https?:\/\/(?:www\.)?github\.com\/([^/]+)\/([^/]+?)(?:\.git)?\/?$/i);
  return match ? `${match[1]}/${match[2]}` : null;
}

function parseGitlabPath(url: string): string | null {
  const match = url.match(/^https?:\/\/(?:www\.)?gitlab\.com\/(.+?)(?:\.git)?\/?$/i);
  return match ? match[1] : null;
}

function parseBitbucketPath(url: string): string | null {
  const match = url.match(/^https?:\/\/(?:www\.)?bitbucket\.org\/([^/]+)\/([^/]+?)(?:\.git)?\/?$/i);
  return match ? `${match[1]}/${match[2]}` : null;
}

async function fetchJson(url: string): Promise<unknown | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    const res = await fetch(url, { headers: { Accept: "application/json" }, signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

type FetchedMetadata = { description: string | null; primaryLanguage: string | null; starCount: number | null };

// Public endpoints only, no auth token (§5.3's boundary) — subject to each
// provider's unauthenticated rate limit, acceptable for a once-daily job.
async function fetchRepositoryMetadata(provider: string, url: string): Promise<FetchedMetadata | null> {
  if (provider === "github") {
    const path = parseGithubPath(url);
    if (!path) return null;
    const data = await fetchJson(`https://api.github.com/repos/${path}`);
    if (!data || typeof data !== "object") return null;
    const repo = data as { description?: string | null; language?: string | null; stargazers_count?: number };
    return {
      description: repo.description ?? null,
      primaryLanguage: repo.language ?? null,
      starCount: typeof repo.stargazers_count === "number" ? repo.stargazers_count : null,
    };
  }

  if (provider === "gitlab") {
    const path = parseGitlabPath(url);
    if (!path) return null;
    const data = await fetchJson(`https://gitlab.com/api/v4/projects/${encodeURIComponent(path)}`);
    if (!data || typeof data !== "object") return null;
    const repo = data as { description?: string | null; star_count?: number };
    return {
      description: repo.description ?? null,
      primaryLanguage: null, // needs a second /languages call — not worth it for a once-daily best-effort sync
      starCount: typeof repo.star_count === "number" ? repo.star_count : null,
    };
  }

  if (provider === "bitbucket") {
    const path = parseBitbucketPath(url);
    if (!path) return null;
    const data = await fetchJson(`https://api.bitbucket.org/2.0/repositories/${path}`);
    if (!data || typeof data !== "object") return null;
    const repo = data as { description?: string | null; language?: string | null };
    return { description: repo.description ?? null, primaryLanguage: repo.language ?? null, starCount: null };
  }

  return null; // provider === "other": no known public API to call
}

export async function syncGitRepositoryMetadata(): Promise<void> {
  const staleBefore = new Date(Date.now() - SYNC_INTERVAL_MS);
  const dueRepos = await db.gitRepository.findMany({
    where: { OR: [{ lastSyncedAt: null }, { lastSyncedAt: { lt: staleBefore } }] },
    take: 200, // per-run cap, same "write-volume safety valve" reasoning as trending.ts's CANDIDATE_LIMIT
  });

  for (const repo of dueRepos) {
    const metadata = await fetchRepositoryMetadata(repo.provider, repo.url);
    await db.gitRepository.update({
      where: { id: repo.id },
      data: {
        lastSyncedAt: new Date(),
        ...(metadata
          ? { description: metadata.description, primaryLanguage: metadata.primaryLanguage, starCount: metadata.starCount }
          : {}),
      },
    });
  }
}

const globalForPortfolioSync = globalThis as unknown as { portfolioSyncSchedulerStarted?: boolean };
let syncing: Promise<void> | null = null;

function triggerSync(): void {
  if (syncing) return;
  syncing = syncGitRepositoryMetadata().finally(() => {
    syncing = null;
  });
}

// Registered from instrumentation.ts alongside startTrendingScheduler().
export function startPortfolioSyncScheduler(): void {
  if (globalForPortfolioSync.portfolioSyncSchedulerStarted) return;
  globalForPortfolioSync.portfolioSyncSchedulerStarted = true;

  triggerSync();
  setInterval(triggerSync, SYNC_INTERVAL_MS);
}

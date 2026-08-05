import "server-only";
import { createHash } from "crypto";

// phase-11 spec: every AI feature (content writer, profile builder,
// moderation, translation, accessibility captioning, search/recommendation
// re-ranking) talks to model inference through this one interface, never a
// provider SDK directly — same delegation shape payments.ts's
// PaymentProcessor and livestream-provider.ts's LivestreamProvider already
// established in this codebase. Swapping in a real model provider (Claude,
// etc.) later means writing a second class implementing this same shape and
// changing getAIProvider() below; nothing above this file needs to change
// shape when that happens.
export interface AIProvider {
  readonly name: string;
  readonly modelName: string;
  suggestText(params: { kind: string; context: string }): Promise<{ text: string; costTokens: number }>;
  classifyModeration(text: string): Promise<{
    riskCategory: "spam" | "harassment" | "violence" | "ip_infringement" | "fraud" | "other";
    confidence: number;
    suggestedAction: "none" | "flag_for_review" | "escalate_urgent";
    costTokens: number;
  }>;
  translate(params: { text: string; targetLanguage: string }): Promise<{ text: string; costTokens: number }>;
  describeMedia(params: { url: string; contentType: string }): Promise<{ altText: string; costTokens: number }>;
  // A fixed-length numeric vector for cosine-similarity comparisons —
  // backs both AI search re-ranking (§8) and AI recommendations (§7).
  embed(text: string): number[];
}

const EMBED_DIMENSIONS = 64;
const SPAM_MARKERS = ["buy now", "click here", "free money", "act now", "limited offer", "guaranteed"];
const HARASSMENT_MARKERS = ["idiot", "shut up", "kill yourself", "worthless", "hate you"];

// Stub only — no real model API key is wired up in this codebase (see
// .env's lack of one), so every method below is a deterministic, local,
// zero-network heuristic. This is a local-testing shortcut, not a model for
// how a real provider's output quality should look; every call site treats
// output as untrusted suggestion text subject to the same
// validation/sanitization a human's input gets (spec §5.1), so the stub's
// simplicity never leaks into a correctness requirement elsewhere.
class StubAIProvider implements AIProvider {
  readonly name = "stub";
  readonly modelName = "stub-heuristic-v1";

  async suggestText({ kind, context }: { kind: string; context: string }) {
    const trimmed = context.trim();
    const costTokens = Math.max(8, Math.round(trimmed.length / 4));
    if (kind === "profile_bio") {
      const topic = trimmed.length > 0 ? trimmed : "building things and sharing what I learn";
      return { text: `Passionate about ${topic}. Always open to connecting.`, costTokens };
    }
    if (kind === "article_draft") {
      const title = trimmed.length > 0 ? trimmed : "this topic";
      return {
        text: `# ${title}\n\nHere's a first draft to get you started. Replace this paragraph with your own introduction, then expand on the key points below.\n\n- Key point one\n- Key point two\n- Key point three`,
        costTokens,
      };
    }
    return { text: trimmed.length > 0 ? `${trimmed} — expanded with a bit more detail.` : "", costTokens };
  }

  async classifyModeration(text: string) {
    const lower = text.toLowerCase();
    const spamHits = SPAM_MARKERS.filter((m) => lower.includes(m)).length;
    const harassmentHits = HARASSMENT_MARKERS.filter((m) => lower.includes(m)).length;
    const costTokens = Math.max(4, Math.round(text.length / 4));

    if (harassmentHits > 0) {
      return {
        riskCategory: "harassment" as const,
        confidence: Math.min(0.5 + harassmentHits * 0.2, 0.98),
        suggestedAction: (harassmentHits >= 2 ? "escalate_urgent" : "flag_for_review") as
          | "flag_for_review"
          | "escalate_urgent",
        costTokens,
      };
    }
    if (spamHits > 0) {
      return {
        riskCategory: "spam" as const,
        confidence: Math.min(0.4 + spamHits * 0.15, 0.95),
        suggestedAction: "flag_for_review" as const,
        costTokens,
      };
    }
    return { riskCategory: "other" as const, confidence: 0.02, suggestedAction: "none" as const, costTokens };
  }

  async translate({ text, targetLanguage }: { text: string; targetLanguage: string }) {
    // No real translation model wired up — the stub marks the target
    // language rather than fabricating fluent text in it, so nothing
    // downstream can mistake this for a real translation in manual testing.
    return { text: `[${targetLanguage}] ${text}`, costTokens: Math.max(8, Math.round(text.length / 4)) };
  }

  async describeMedia({ contentType }: { url: string; contentType: string }) {
    return { altText: `${contentType} content (AI-generated description pending review)`, costTokens: 10 };
  }

  embed(text: string): number[] {
    // Deterministic bag-of-words hash embedding, not a learned model — a
    // stand-in that lets search re-ranking and recommendation similarity be
    // built, tested, and swapped for a real embedding model later without
    // changing any caller. Cosine similarity over this vector approximates
    // shared-vocabulary overlap, nothing more.
    const vector = new Array<number>(EMBED_DIMENSIONS).fill(0);
    const words = text.toLowerCase().match(/[a-z0-9]+/g) ?? [];
    for (const word of words) {
      const hash = createHash("sha1").update(word).digest();
      const bucket = hash.readUInt32BE(0) % EMBED_DIMENSIONS;
      const sign = hash[4] % 2 === 0 ? 1 : -1;
      vector[bucket] += sign;
    }
    const magnitude = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0)) || 1;
    return vector.map((v) => v / magnitude);
  }
}

export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot; // both vectors are pre-normalized by embed(), so dot product == cosine similarity
}

const provider: AIProvider = new StubAIProvider();

export function getAIProvider(): AIProvider {
  return provider;
}

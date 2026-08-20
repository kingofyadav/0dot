import "server-only";
import { createHash } from "crypto";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";

// phase-11 spec: every AI feature (content writer, profile builder,
// moderation, translation, accessibility captioning, search/recommendation
// re-ranking) talks to model inference through this one interface, never a
// provider SDK directly — same delegation shape payments.ts's
// PaymentProcessor and livestream-provider.ts's LivestreamProvider already
// established in this codebase. `modelName` moved from a provider-level
// field into each method's own return value below: ClaudeAIProvider calls
// a different real model per method (Haiku for moderation's volume,
// Opus for everything else), so no single static name is accurate anymore.
export interface AIProvider {
  readonly name: string;
  suggestText(params: { kind: string; context: string }): Promise<{ text: string; costTokens: number; modelName: string }>;
  classifyModeration(text: string): Promise<{
    riskCategory: "spam" | "harassment" | "violence" | "ip_infringement" | "fraud" | "other";
    confidence: number;
    suggestedAction: "none" | "flag_for_review" | "escalate_urgent";
    costTokens: number;
    modelName: string;
  }>;
  translate(params: { text: string; targetLanguage: string }): Promise<{ text: string; costTokens: number; modelName: string }>;
  describeMedia(params: { url: string; contentType: string }): Promise<{ altText: string; costTokens: number; modelName: string }>;
  // A fixed-length numeric vector for cosine-similarity comparisons —
  // backs both AI search re-ranking (§8) and AI recommendations (§7).
  // Stays synchronous and hash-based even under ClaudeAIProvider — Claude
  // has no embeddings endpoint, and a real one (Voyage AI) is a deliberate,
  // separate follow-up rather than a second vendor bundled into this pass.
  embed(text: string): number[];
}

const EMBED_DIMENSIONS = 64;
const SPAM_MARKERS = ["buy now", "click here", "free money", "act now", "limited offer", "guaranteed"];
const HARASSMENT_MARKERS = ["idiot", "shut up", "kill yourself", "worthless", "hate you"];

const STUB_MODEL_NAME = "stub-heuristic-v1";
// Logged by embed()'s two callers (ai-search.ts, suggested-users.ts)
// instead of a provider-level modelName — the hash embedding never calls
// a model under either provider, real or stub, so it gets its own name
// rather than borrowing StubAIProvider's or ClaudeAIProvider's.
export const HASH_EMBEDDING_MODEL_NAME = "hash-bow-embedding-v1";

// Deterministic bag-of-words hash embedding, not a learned model — shared
// by StubAIProvider and ClaudeAIProvider (Claude has no embeddings
// endpoint, and the user chose to keep this approximation rather than add
// a second vendor for real embeddings in this pass). Cosine similarity
// over this vector approximates shared-vocabulary overlap, nothing more.
function hashEmbed(text: string): number[] {
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

// Stub only — used whenever ANTHROPIC_API_KEY is unset (today: always in
// dev without a key, and always in tests/CI). Every method below is a
// deterministic, local, zero-network heuristic. This is a local-testing
// shortcut, not a model for how a real provider's output quality should
// look; every call site treats output as untrusted suggestion text subject
// to the same validation/sanitization a human's input gets (spec §5.1), so
// the stub's simplicity never leaks into a correctness requirement
// elsewhere.
class StubAIProvider implements AIProvider {
  readonly name = "stub";

  async suggestText({ kind, context }: { kind: string; context: string }) {
    const trimmed = context.trim();
    const costTokens = Math.max(8, Math.round(trimmed.length / 4));
    if (kind === "profile_bio") {
      const topic = trimmed.length > 0 ? trimmed : "building things and sharing what I learn";
      return { text: `Passionate about ${topic}. Always open to connecting.`, costTokens, modelName: STUB_MODEL_NAME };
    }
    if (kind === "article_draft") {
      const title = trimmed.length > 0 ? trimmed : "this topic";
      return {
        text: `# ${title}\n\nHere's a first draft to get you started. Replace this paragraph with your own introduction, then expand on the key points below.\n\n- Key point one\n- Key point two\n- Key point three`,
        costTokens,
        modelName: STUB_MODEL_NAME,
      };
    }
    return { text: trimmed.length > 0 ? `${trimmed} — expanded with a bit more detail.` : "", costTokens, modelName: STUB_MODEL_NAME };
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
        modelName: STUB_MODEL_NAME,
      };
    }
    if (spamHits > 0) {
      return {
        riskCategory: "spam" as const,
        confidence: Math.min(0.4 + spamHits * 0.15, 0.95),
        suggestedAction: "flag_for_review" as const,
        costTokens,
        modelName: STUB_MODEL_NAME,
      };
    }
    return { riskCategory: "other" as const, confidence: 0.02, suggestedAction: "none" as const, costTokens, modelName: STUB_MODEL_NAME };
  }

  async translate({ text, targetLanguage }: { text: string; targetLanguage: string }) {
    // No real translation model wired up — the stub marks the target
    // language rather than fabricating fluent text in it, so nothing
    // downstream can mistake this for a real translation in manual testing.
    return { text: `[${targetLanguage}] ${text}`, costTokens: Math.max(8, Math.round(text.length / 4)), modelName: STUB_MODEL_NAME };
  }

  async describeMedia({ contentType }: { url: string; contentType: string }) {
    return { altText: `${contentType} content (AI-generated description pending review)`, costTokens: 10, modelName: STUB_MODEL_NAME };
  }

  embed(text: string): number[] {
    return hashEmbed(text);
  }
}

const moderationSchema = z.object({
  riskCategory: z.enum(["spam", "harassment", "violence", "ip_infringement", "fraud", "other"]),
  confidence: z.number().min(0).max(1),
  suggestedAction: z.enum(["none", "flag_for_review", "escalate_urgent"]),
});

const MODERATION_MODEL = "claude-haiku-4-5";
const GENERATION_MODEL = "claude-opus-5";

const MODERATION_SYSTEM_PROMPT =
  "You are a content moderation classifier for a social platform. Classify the given text into exactly one risk category. " +
  "Categorical note: matches against known CSAM hash databases are handled by a separate, mandatory legal-reporting pipeline, never " +
  "by this classifier — if text merely discusses that topic in the abstract (not an actual instance), classify it under the closest " +
  "ordinary category (e.g. 'other') rather than inventing a category. Be conservative: only suggest flag_for_review or " +
  "escalate_urgent when the text plausibly warrants human review; most ordinary text should classify as risk_category 'other' with a " +
  "low confidence and suggestedAction 'none'.";

function suggestTextSystemPrompt(kind: string): string {
  if (kind === "profile_bio") {
    return "You write short, warm, first-person social media bios (1-2 sentences). Return only the bio text, no preamble, no quotes.";
  }
  if (kind === "article_draft") {
    return "You write a short first-draft outline for an article, in Markdown, given a topic. Return only the draft, no preamble.";
  }
  return "You expand on the given text with a bit more detail, in the same voice. Return only the expanded text, no preamble.";
}

// Real provider — used whenever ANTHROPIC_API_KEY is set (see
// getAIProvider() below). Model tiering (Haiku 4.5 for moderation's
// every-post volume, Opus 5 for everything else) and the image-only scope
// of describeMedia were both explicit product decisions, not defaults —
// see the phase-11 build plan for the reasoning.
class ClaudeAIProvider implements AIProvider {
  readonly name = "claude";
  private readonly client = new Anthropic();

  async suggestText({ kind, context }: { kind: string; context: string }) {
    const maxTokens = kind === "article_draft" ? 800 : 300;
    const response = await this.client.messages.create(
      {
        model: GENERATION_MODEL,
        max_tokens: maxTokens,
        system: suggestTextSystemPrompt(kind),
        messages: [{ role: "user", content: context.trim().length > 0 ? context : "(no context given)" }],
      },
      { timeout: 20_000 },
    );
    const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === "text");
    return {
      text: textBlock?.text.trim() ?? "",
      costTokens: response.usage.input_tokens + response.usage.output_tokens,
      modelName: GENERATION_MODEL,
    };
  }

  async classifyModeration(text: string) {
    const response = await this.client.messages.parse(
      {
        model: MODERATION_MODEL,
        max_tokens: 300,
        system: MODERATION_SYSTEM_PROMPT,
        messages: [{ role: "user", content: text }],
        output_config: { format: zodOutputFormat(moderationSchema) },
      },
      { timeout: 30_000 },
    );
    // parsed_output is null only if parsing genuinely failed (malformed
    // JSON from the model) — falling back to the safest possible
    // classification (no action) rather than throwing keeps one bad
    // response from taking down the whole moderation sweep; the caller
    // (ai-moderation.ts) still logs the raw generation either way.
    const parsed = response.parsed_output ?? { riskCategory: "other" as const, confidence: 0, suggestedAction: "none" as const };
    return {
      ...parsed,
      costTokens: response.usage.input_tokens + response.usage.output_tokens,
      modelName: MODERATION_MODEL,
    };
  }

  async translate({ text, targetLanguage }: { text: string; targetLanguage: string }) {
    const maxTokens = Math.min(Math.max(Math.round(text.length / 2), 256), 8000);
    const response = await this.client.messages.create(
      {
        model: GENERATION_MODEL,
        max_tokens: maxTokens,
        system:
          `Translate the given text to ${targetLanguage}. Preserve formatting (Markdown, line breaks). ` +
          "Return only the translated text — no preamble, no explanation, no quotes around it.",
        messages: [{ role: "user", content: text }],
      },
      { timeout: 20_000 },
    );
    const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === "text");
    return {
      text: textBlock?.text.trim() ?? text,
      costTokens: response.usage.input_tokens + response.usage.output_tokens,
      modelName: GENERATION_MODEL,
    };
  }

  async describeMedia({ url, contentType }: { url: string; contentType: string }) {
    if (contentType !== "image") {
      // No native Claude equivalent for video-frame or audio-transcript
      // captioning (that needs frame extraction / a speech-to-text vendor
      // — a separate follow-up). Same placeholder text as StubAIProvider,
      // tagged with the stub's model name so the AIGeneration log stays
      // honest about what actually ran.
      return { altText: `${contentType} content (AI-generated description pending review)`, costTokens: 10, modelName: STUB_MODEL_NAME };
    }
    const response = await this.client.messages.create(
      {
        model: GENERATION_MODEL,
        max_tokens: 150,
        messages: [
          {
            role: "user",
            content: [
              { type: "image", source: { type: "url", url } },
              { type: "text", text: "Write a concise, factual alt-text description of this image for accessibility. One or two sentences, no preamble." },
            ],
          },
        ],
      },
      { timeout: 20_000 },
    );
    const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === "text");
    return {
      altText: textBlock?.text.trim() ?? "Image (description unavailable)",
      costTokens: response.usage.input_tokens + response.usage.output_tokens,
      modelName: GENERATION_MODEL,
    };
  }

  embed(text: string): number[] {
    return hashEmbed(text);
  }
}

export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot; // both vectors are pre-normalized by embed(), so dot product == cosine similarity
}

const stubProvider: AIProvider = new StubAIProvider();
let realProvider: AIProvider | null = null;

export function getAIProvider(): AIProvider {
  // Lazy construction — unlike stripe.ts's eager module-scope client, this
  // never constructs (or authenticates) an Anthropic client unless a key is
  // actually present, so an unset ANTHROPIC_API_KEY (today's default, and
  // every test/CI run) costs nothing and touches no network.
  if (!process.env.ANTHROPIC_API_KEY) return stubProvider;
  if (!realProvider) realProvider = new ClaudeAIProvider();
  return realProvider;
}

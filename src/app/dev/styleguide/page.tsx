import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  Bell,
  Search,
  Heart,
  MessageCircle,
  Repeat2,
  Bookmark,
  Link2,
  Users,
  Briefcase,
  Newspaper,
  Quote,
} from "lucide-react";
import { Icon } from "@/components/Icon";
import { EmptyState } from "@/components/EmptyState";
import { PageHeader } from "@/components/PageHeader";
import { StyleguideMotion } from "./StyleguideMotion";
import styles from "./styleguide.module.css";

// Redesign Phase 0 (docs/specs/phase-0-redesign.md §7). A living reference for
// every design-system primitive, rendered in whatever theme the viewer has
// set — the surface every later redesign phase is checked against. Dev + preview
// only: hidden on the production domain, disallowed in robots.ts, not in the
// sitemap.
export const metadata: Metadata = {
  title: "Styleguide",
  robots: { index: false, follow: false },
};

function isHidden() {
  return process.env.VERCEL_ENV === "production";
}

const COLOR_TOKENS = [
  ["--background", "Page background"],
  ["--surface", "Cards, header, raised"],
  ["--surface-2", "Nested / inset regions"],
  ["--popover", "Dropdowns, popovers"],
  ["--foreground", "Primary text"],
  ["--muted-foreground", "Secondary text"],
  ["--border", "Hairline dividers"],
  ["--border-strong", "Card / input edges"],
  ["--accent", "Primary interactive"],
  ["--accent-strong", "Hover / active"],
  ["--success", "Positive status"],
  ["--warning", "Caution status"],
  ["--danger", "Destructive status"],
];

const TYPE_SCALE = [
  ["--text-6xl", "Display 1 — marketing hero"],
  ["--text-5xl", "Display 2"],
  ["--text-4xl", "Display 3 / hero number"],
  ["--text-3xl", "Page headline"],
  ["--text-2xl", "h1 — profile name"],
  ["--text-xl", "h2 — card / page heading"],
  ["--text-lg", "h3 — section heading"],
  ["--text-base", "Body"],
  ["--text-sm", "Body secondary, labels"],
  ["--text-xs", "Meta, timestamps"],
];

export default function StyleguidePage() {
  if (isHidden()) notFound();

  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <span className="eyebrow">Redesign · Phase 0</span>
        <h1 className="display-3">Styleguide</h1>
        <p className={styles.lede}>
          Every design-system primitive, in your current theme. Toggle the theme
          from the header logo to check light and dark parity.
        </p>
      </header>

      <section className={styles.section}>
        <span className="eyebrow">Color &amp; depth</span>
        <div className={styles.swatchGrid}>
          {COLOR_TOKENS.map(([token, use]) => (
            <div key={token} className={styles.swatch}>
              <span
                className={styles.swatchChip}
                style={{ background: `var(${token})` }}
              />
              <code>{token}</code>
              <span className={styles.muted}>{use}</span>
            </div>
          ))}
        </div>
        <div className={styles.elevationRow}>
          <div className={styles.elevationCard} style={{ boxShadow: "var(--shadow)" }}>
            --shadow
          </div>
          <div className={styles.elevationCard} style={{ boxShadow: "var(--shadow-md)" }}>
            --shadow-md
          </div>
          <div className={styles.elevationCard} style={{ boxShadow: "var(--shadow-lg)" }}>
            --shadow-lg
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <span className="eyebrow">Typography</span>
        <div className={styles.typeStack}>
          {TYPE_SCALE.map(([token, label]) => (
            <div key={token} className={styles.typeRow}>
              <span style={{ fontSize: `var(${token})`, lineHeight: 1.1 }}>
                One identity
              </span>
              <span className={styles.muted}>
                <code>{token}</code> · {label}
              </span>
            </div>
          ))}
        </div>
        <div className={styles.typeStack}>
          <h1>Heading level 1</h1>
          <h2>Heading level 2</h2>
          <h3>Heading level 3</h3>
          <p className={styles.bodyDemo}>
            Body copy sits at <code>--text-base</code> with{" "}
            <code>--leading-body</code>. Your permanent home on the internet —
            one profile that other surfaces attach to.
          </p>
          <span className="eyebrow">Eyebrow label</span>
        </div>
      </section>

      <section className={styles.section}>
        <span className="eyebrow">Buttons</span>
        <div className={styles.row}>
          <button className="button motion-press">Primary</button>
          <button className="button buttonSecondary motion-press">Secondary</button>
          <button className="button buttonDanger motion-press">Destructive</button>
          <button className="button iconButton motion-press" aria-label="More">
            <Icon as={Bell} size="sm" />
          </button>
        </div>
      </section>

      <section className={styles.section}>
        <span className="eyebrow">Page header</span>
        <div className={styles.demoFrame}>
          <PageHeader
            eyebrow="Communities"
            title="Find your people"
            description="Public spaces you can join, plus the ones you already run."
            actions={<button className="button">Create community</button>}
          />
        </div>
      </section>

      <section className={styles.section}>
        <span className="eyebrow">Cards</span>
        <div className={styles.row} style={{ alignItems: "stretch" }}>
          <div className="card" style={{ flex: "1 1 220px" }}>
            <strong>.card</strong>
            <p className={styles.muted}>Surface, strong border, soft shadow.</p>
          </div>
          <div className="card card--inset" style={{ flex: "1 1 220px" }}>
            <strong>.card--inset</strong>
            <p className={styles.muted}>Nested region — no shadow, surface-2.</p>
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <span className="eyebrow">Feed actions — <code>.postAction</code></span>
        <div className={styles.demoFrame}>
          <div className="postActionsRow">
            <button className="postAction" data-like aria-pressed="true">
              <Icon as={Heart} size="sm" /> 128
            </button>
            <button className="postAction">
              <Icon as={MessageCircle} size="sm" /> 12
            </button>
            <button className="postAction">
              <Icon as={Repeat2} size="sm" /> Repost
            </button>
            <button className="postAction">
              <Icon as={Quote} size="sm" /> Quote
            </button>
            <button className="postAction postActionEnd" aria-pressed="true" aria-label="Bookmarked">
              <Icon as={Bookmark} size="sm" />
            </button>
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <span className="eyebrow">Empty state</span>
        <div className={styles.demoFrame}>
          <EmptyState
            icon={Newspaper}
            title="Your feed is quiet"
            description="Follow a few people, or post something to get it started."
            action={<button className="button">Find people to follow</button>}
          />
        </div>
      </section>

      <section className={styles.section}>
        <span className="eyebrow">Inputs</span>
        <div className={styles.formGrid}>
          <label className="field">
            <span>Text input</span>
            <input className="textInput" placeholder="username" />
          </label>
          <label className="field">
            <span>Textarea</span>
            <textarea className="textInput" rows={3} placeholder="What's happening?" />
          </label>
        </div>
      </section>

      <section className={styles.section}>
        <span className="eyebrow">Icons — 16 / 20 / 24, stroke 1.75</span>
        <div className={styles.row}>
          {[Search, Heart, MessageCircle, Repeat2, Bookmark, Link2, Users, Briefcase].map(
            (Cmp, i) => (
              <Icon key={i} as={Cmp} size={i % 3 === 0 ? "lg" : i % 3 === 1 ? "md" : "sm"} />
            ),
          )}
        </div>
      </section>

      <section className={styles.section}>
        <span className="eyebrow">Motion</span>
        <StyleguideMotion />
      </section>
    </div>
  );
}

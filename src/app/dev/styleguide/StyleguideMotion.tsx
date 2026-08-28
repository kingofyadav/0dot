"use client";

// Redesign Phase 0 — interactive demos of the four motion primitives from
// globals.css (§4.4). Each "Replay" remounts its demo subtree so the
// mount-triggered animations run again.

import { useState } from "react";
import styles from "./styleguide.module.css";

function Demo({ title, note, children }: { title: string; note: string; children: React.ReactNode }) {
  const [key, setKey] = useState(0);
  return (
    <div className={styles.motionDemo}>
      <div className={styles.motionDemoHead}>
        <div>
          <strong>{title}</strong>
          <span className={styles.muted}> · {note}</span>
        </div>
        <button className="button buttonSecondary motion-press" onClick={() => setKey((k) => k + 1)}>
          Replay
        </button>
      </div>
      <div key={key} className={styles.motionDemoStage}>
        {children}
      </div>
    </div>
  );
}

export function StyleguideMotion() {
  return (
    <div className={styles.motionGrid}>
      <Demo title="motion-page-in" note="main content on route change">
        <div className="motion-page-in" style={{ width: "100%" }}>
          <div className={styles.motionBlock} />
        </div>
      </Demo>

      <Demo title="motion-stagger" note="list children on first paint">
        <div className="motion-stagger" style={{ display: "grid", gap: "0.5rem", width: "100%" }}>
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className={styles.motionRow} />
          ))}
        </div>
      </Demo>

      <Demo title="motion-lift" note="hover a card / row">
        <div className={`${styles.motionBlock} motion-lift`} />
      </Demo>

      <Demo title="motion-press" note="press and hold">
        <button className="button motion-press">Press me</button>
      </Demo>
    </div>
  );
}

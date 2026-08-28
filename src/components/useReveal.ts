"use client";

// Redesign Phase 0 (docs/specs/phase-0-redesign.md §4.4).
//
// Scroll-triggered reveal for the `.motion-reveal` utility in globals.css.
// Returns a ref to attach to the element: once it scrolls into view, the hook
// adds `.is-revealed` and stops observing (reveal is one-way — content does
// not re-hide on scroll-out).
//
// Reduced motion: the `.motion-reveal` transition is already zeroed globally
// by the prefers-reduced-motion rule / html[data-reduced-motion="true"], so
// the element still ends visible with no animation. The hook also short-
// circuits to immediately-revealed when the media query matches, so nothing
// depends on an observer that a reduced-motion user gains nothing from.
//
// Usage:
//   const ref = useReveal<HTMLDivElement>();
//   <div ref={ref} className="motion-reveal">…</div>

import { useEffect, useRef } from "react";

export function useReveal<T extends HTMLElement = HTMLElement>({
  threshold = 0.15,
  rootMargin = "0px 0px -10% 0px",
}: { threshold?: number; rootMargin?: string } = {}) {
  const ref = useRef<T>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const attrReduced =
      document.documentElement.getAttribute("data-reduced-motion") === "true";

    // Armed only once JS is running — the element stays visible for no-JS
    // visitors and crawlers (the CSS only hides `.motion-reveal.is-armed`).
    el.classList.add("is-armed");

    if (reduced || attrReduced || typeof IntersectionObserver === "undefined") {
      el.classList.add("is-revealed");
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-revealed");
            observer.unobserve(entry.target);
          }
        }
      },
      { threshold, rootMargin },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [threshold, rootMargin]);

  return ref;
}

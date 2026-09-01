"use client";

import { useReveal } from "@/components/useReveal";

// The scroll-reveal wrapper for MarketingStory's sections. Split out of
// MarketingStory so that component can stay a server component — only this
// wrapper (which needs useReveal's IntersectionObserver) hydrates; the
// section content itself is server-rendered markup passed as children.
export function MarketingSection({
  eyebrow,
  title,
  children,
  visual,
  flip = false,
}: {
  eyebrow: string;
  title: string;
  children: React.ReactNode;
  visual: React.ReactNode;
  flip?: boolean;
}) {
  const ref = useReveal<HTMLElement>();
  return (
    <section ref={ref} className={`marketingSection motion-reveal${flip ? " marketingSection--flip" : ""}`}>
      <div className="marketingSectionText">
        <span className="eyebrow">{eyebrow}</span>
        <h2 className="display-3">{title}</h2>
        <p>{children}</p>
      </div>
      <div className="marketingSectionVisual" aria-hidden="true">
        {visual}
      </div>
    </section>
  );
}

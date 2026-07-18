"use client";
import { type ReactNode, useEffect, useRef } from "react";

// Scroll-into-view entrance for landing sections. Progressive enhancement only: the
// wrapper renders `display: contents` and children are fully visible until JS marks
// [data-reveal] descendants hidden, then replays the landing-rise keyframes (staggered
// 70ms) as each nears the viewport. No JS, no IntersectionObserver, or reduced motion
// all leave the settled state untouched (the hiding class is gated in globals.css).
export function Reveal({ children }: { children: ReactNode }): ReactNode {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = ref.current;
    if (root === null || typeof IntersectionObserver === "undefined") return;
    const targets = Array.from(root.querySelectorAll<HTMLElement>("[data-reveal]"));
    for (const [i, target] of targets.entries()) {
      target.style.animationDelay = `${i * 70}ms`;
      target.classList.add("landing-reveal-pending");
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.remove("landing-reveal-pending");
          entry.target.classList.add("landing-reveal");
          io.unobserve(entry.target);
        }
      },
      { rootMargin: "0px 0px -10% 0px", threshold: 0.1 },
    );
    for (const target of targets) io.observe(target);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={ref} className="contents">
      {children}
    </div>
  );
}

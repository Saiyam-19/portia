"use client";

import { useEffect, useRef } from "react";
import { ButtonLink } from "./Button";
import { LogoMark } from "./Logo";

const COLUMNS = [
  { title: "Product", links: [["Estimate", "/login?tab=signup"], ["Compare ports", "#compare"], ["Ports", "#ports"]] },
  { title: "Company", links: [["About", "#about"], ["Contact", "#contact"]] },
  { title: "Legal", links: [["Privacy Policy", "#privacy"], ["Terms of Service", "#terms"]] },
] as const;

/** Lassie's footer panel: closing line + CTA, link columns, and a mono colophon. */
export function Footer() {
  return (
    <footer className="footer">
      <div className="footer-lead">
        <p className="footer-title">
          Port costs,
          <br />
          <em>before you berth.</em>
        </p>
        <ButtonLink href="/login?tab=signup">Try a free estimate</ButtonLink>
      </div>
      <div className="footer-side">
        <div className="footer-links">
          {COLUMNS.map((col) => (
            <dl key={col.title}>
              <dt>{col.title}</dt>
              {col.links.map(([label, href]) => (
                <dd key={label}>
                  <a href={href}>{label}</a>
                </dd>
              ))}
            </dl>
          ))}
        </div>
        <div className="footer-colophon">
          <LogoMark className="footer-mark" role="img" aria-label="Berthwise" />
          <p>
            © 2026 Berthwise. All rights reserved.
            <br />
            Port-call costs, starting with India.
          </p>
        </div>
      </div>
    </footer>
  );
}

/** Lassie's oversized wordmark, fixed under the page and revealed below the footer. Sized to span 96% of the viewport. */
export function FooterWordmark() {
  const text = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = text.current;
    if (!el) return;
    const fit = () => {
      el.style.fontSize = "100px";
      el.style.fontSize = `${(100 * window.innerWidth * 0.96) / el.offsetWidth}px`;
    };
    fit();
    document.fonts.ready.then(fit);
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);
  return (
    <div className="wordmark" aria-hidden="true">
      <span ref={text}>Berthwise</span>
    </div>
  );
}

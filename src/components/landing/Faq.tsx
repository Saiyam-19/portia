"use client";

import { useEffect, useId, useRef, useState } from "react";

// Answers lean only on what the site already says (published schedules, before GST, IMO look-up).
const ITEMS = [
  {
    q: "What does Berthwise estimate?",
    a: "The charges for a vessel’s call at an Indian port: port dues, pilotage, berth hire, towage and mooring, itemised line by line with a total before GST.",
  },
  {
    q: "Where do the rates come from?",
    a: "From each port’s published scale of rates. Every line in an estimate points back to the section of the schedule it was read from.",
  },
  {
    q: "Which ports are covered?",
    a: "India’s major and private ports, starting with their latest published schedules.",
  },
  {
    q: "How current are the tariffs?",
    a: "Schedules are re-read whenever a port publishes a revision, so an estimate uses the rates in force.",
  },
  {
    q: "What do I need to get an estimate?",
    a: "An IMO number, the port and how long you’ll be alongside. Berthwise fills in the vessel’s particulars, and you can change any of them.",
  },
  {
    q: "Can I compare ports?",
    a: "Yes. Ask for two or more ports and the same vessel is priced against each schedule, side by side.",
  },
  {
    q: "Does an estimate include GST?",
    a: "No. Figures are shown before GST, as the ports publish them.",
  },
];

function Chevron() {
  return (
    <svg viewBox="0 0 42 34" fill="none" aria-hidden="true">
      <path
        d="M13.9424 19.759C16.5148 18.269 18.6686 16.1521 20.2028 13.6058L20.3714 13.3255C20.5042 13.1051 20.7433 12.9706 21.0007 12.9706C21.258 12.9706 21.4964 13.1052 21.6293 13.3255L21.7979 13.6058C23.332 16.1521 25.486 18.269 28.0583 19.759L27.3225 21.0294C24.7831 19.5585 22.6221 17.5224 21.0007 15.0855C19.3792 17.5224 17.2184 19.5585 14.6789 21.0294L13.9424 19.759Z"
        fill="currentColor"
      />
    </svg>
  );
}

/** Lassie's FAQ: one answer open at a time, the whole card presses, the panel eases open over 200ms. */
export function Faq() {
  const [open, setOpen] = useState(-1);
  const id = useId();
  const list = useRef<HTMLDivElement>(null);

  // Room for the tallest answer up front, so opening one never shoves the footer.
  useEffect(() => {
    const el = list.current;
    if (!el) return;
    const fit = () => {
      el.style.minHeight = "";
      const shut = el.offsetHeight - (el.querySelector<HTMLElement>("[data-open] .faq-panel")?.offsetHeight ?? 0);
      const tallest = Math.max(...[...el.querySelectorAll(".faq-panel > div")].map((d) => d.scrollHeight));
      el.style.minHeight = `${shut + tallest}px`;
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);
  return (
    <section id="faq" className="faq" aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} className="faq-title">
        FAQ
      </h2>
      <div ref={list} className="faq-list">
        {ITEMS.map(({ q, a }, i) => {
          const on = open === i;
          return (
            // The button carries keyboard and AT semantics; the card's click only widens the hit area.
            <div key={q} className="faq-item" data-open={on || undefined} onClick={() => setOpen(on ? -1 : i)}>
              <div className="faq-body">
                <button type="button" className="faq-q" aria-expanded={on} aria-controls={`${id}-${i}`}>
                  {q}
                </button>
                <div id={`${id}-${i}`} role="region" aria-label={q} className="faq-panel">
                  <div>
                    <p className="faq-a">{a}</p>
                  </div>
                </div>
              </div>
              <span className="faq-chevron">
                <Chevron />
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

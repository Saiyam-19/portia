"use client";

import { useState } from "react";
import { Button } from "./Button";
import { LogoMark } from "./Logo";

/** Lassie's closing card: full-bleed photo, white mark, headline and a frosted email field. */
export function Cta() {
  const [sent, setSent] = useState(false);
  return (
    <section className="cta">
      <div className="cta-card">
        <img className="cta-photo" src="/media/cta.webp" alt="" loading="lazy" decoding="async" />
        <div className="cta-body">
          <LogoMark className="cta-mark" body="#fff" aria-hidden="true" />
          <h2 className="cta-title">
            Plain sailing
            <br />
            for every port call
          </h2>
          <form
            className="cta-form"
            onSubmit={(e) => {
              e.preventDefault();
              // No backend yet: acknowledge locally.
              e.currentTarget.reset();
              setSent(true);
            }}
          >
            <input
              type="email"
              name="email"
              required
              autoComplete="email"
              aria-label="Your email"
              placeholder={sent ? "Thanks. We’ll be in touch." : "Your email"}
              disabled={sent}
              data-1p-ignore
            />
            <Button type="submit" variant="light" disabled={sent}>
              Get started
            </Button>
          </form>
        </div>
      </div>
    </section>
  );
}

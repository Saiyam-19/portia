"use client";

import { useRef } from "react";
import { Agents } from "./agents/Agents";
import { Depth } from "./depth/Depth";
import { SheetGradient } from "./depth/Gradient";
import { HarborStrip } from "./ship/HarborStrip";
import { Cta } from "./Cta";
import { Faq } from "./Faq";
import { Footer, FooterWordmark } from "./Footer";
import { Hero } from "./Hero";
import { Loader } from "./Loader";
import { Nav } from "./Nav";
import { ShipHarbor } from "./ship/ShipHarbor";
import { Scrollbar } from "./Scrollbar";
import { SmoothScroll } from "./SmoothScroll";

export function Landing() {
  const sheet = useRef<HTMLDivElement>(null);
  return (
    <>
      <SmoothScroll />
      <Loader />
      <Scrollbar />
      <Nav />
      <FooterWordmark />
      <div className="shell">
        <Hero sheet={sheet} figure={({ start, paused }) => <ShipHarbor start={start} paused={paused} />} />
        <div ref={sheet} className="sheet">
          <SheetGradient />
          <Depth />
          <HarborStrip />
          <Agents />
          <Faq />
          <Cta />
          <Footer />
        </div>
      </div>
    </>
  );
}

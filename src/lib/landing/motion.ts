"use client";

import { gsap } from "gsap";
import { CustomEase } from "gsap/CustomEase";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";

gsap.registerPlugin(ScrollTrigger, SplitText, CustomEase);

// Kaiko's "joe" curves (kaiko bundle D4qjNL0t.js:30408).
CustomEase.create("joe.in", "M0,0 C0.8,0 0.8,0.5 1,1");
CustomEase.create("joe.out", "M0,0 C0.2,0 0.1,1 1,1");
CustomEase.create("joe.inOut", "M0,0 C0.333,0 0,1 1,1");

// Lassie's motion constants (lassie bundle 084-3n5qd4xte.js).
export const DURATION = { fast: 0.3, medium: 0.6, slow: 1 };
export const EASE = "power4.out";
export const EASE_OUT = "expo.out";

export const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export const isTouch = () =>
  typeof window !== "undefined" &&
  (navigator.maxTouchPoints > 0 || window.matchMedia("(any-pointer: coarse)").matches);

export { gsap, ScrollTrigger, SplitText, CustomEase };

---
name: Plisto chat workspace
description: Focused maritime chat with equivalent light and dark themes.
colors:
  background-light: "oklch(1 0 0)"
  background-dark: "oklch(0.145 0 0)"
  foreground-light: "oklch(0.145 0 0)"
  foreground-dark: "oklch(0.985 0 0)"
  card-light: "oklch(1 0 0)"
  card-dark: "oklch(0.205 0 0)"
  primary-light: "oklch(0.205 0 0)"
  primary-dark: "oklch(0.922 0 0)"
  primary-foreground-light: "oklch(0.985 0 0)"
  primary-foreground-dark: "oklch(0.205 0 0)"
  muted-light: "oklch(0.97 0 0)"
  muted-dark: "oklch(0.269 0 0)"
  muted-foreground-light: "#686b69"
  muted-foreground-dark: "oklch(0.708 0 0)"
  sidebar-light: "#f5f5f4"
  sidebar-dark: "oklch(0.205 0 0)"
  brand-light: "#376c60"
  brand-dark: "#98c8ba"
  border-light: "oklch(0.922 0 0)"
  border-dark: "oklch(1 0 0 / 10%)"
  input-light: "oklch(0.922 0 0)"
  input-dark: "oklch(1 0 0 / 15%)"
  ring-light: "oklch(0.708 0 0)"
  ring-dark: "oklch(0.556 0 0)"
  destructive-light: "oklch(0.577 0.245 27.325)"
  destructive-dark: "oklch(0.704 0.191 22.216)"
typography:
  headline:
    fontFamily: "Geist, sans-serif"
    fontSize: "1.875rem"
    fontWeight: 500
    lineHeight: 1.25
    letterSpacing: "-0.025em"
  title:
    fontFamily: "Geist, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 500
    lineHeight: "1.25rem"
  body:
    fontFamily: "Geist, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: "1.75rem"
  label:
    fontFamily: "Geist, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 400
    lineHeight: "1rem"
  code:
    fontFamily: "Geist Mono, monospace"
    fontSize: "0.75rem"
rounded:
  md: "0.5rem"
  lg: "0.625rem"
  xl: "0.875rem"
  2xl: "1.125rem"
  full: "9999px"
spacing:
  2: "0.5rem"
  3: "0.75rem"
  4: "1rem"
  5: "1.25rem"
  8: "2rem"
components:
  button-primary:
    backgroundColor: "var(--primary)"
    textColor: "var(--primary-foreground)"
    rounded: "{rounded.lg}"
    height: "2rem"
    padding: "0 0.625rem"
  button-outline:
    backgroundColor: "var(--background)"
    textColor: "var(--foreground)"
    rounded: "{rounded.lg}"
    height: "2.5rem"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "var(--muted-foreground)"
    rounded: "{rounded.full}"
  input:
    textColor: "var(--foreground)"
    rounded: "{rounded.lg}"
    height: "2.5rem"
    padding: "0.25rem 0.625rem"
  navigation-item:
    textColor: "var(--sidebar-foreground)"
    rounded: "{rounded.md}"
    height: "2.25rem"
    padding: "0.5rem 0.625rem"
  composer:
    backgroundColor: "var(--card)"
    rounded: "{rounded.2xl}"
    padding: "0.375rem"
  form-card:
    backgroundColor: "var(--card)"
    rounded: "{rounded.2xl}"
  response-table:
    textColor: "var(--foreground)"
    rounded: "{rounded.xl}"
---

# Design System: Plisto chat workspace

## Overview

**Creative North Star: "Focused maritime chat workspace"**

This documents the implemented `/dashboard` and `/dashboard/chat/[id]` surfaces. The Codex-inspired composition keeps conversation primary: compact history navigation, a quiet header, an open reading column, and a rounded composer. It is a scoped chat system, not a product-wide rebrand.

Official shadcn/ui `radix-nova` primitives, Geist, Lucide icons, and semantic CSS variables carry the design. Preserve the Plisto name, maritime context, and existing behavior.

**Key Characteristics:**

- Neutral surfaces and charcoal text, with restrained teal details.
- Equivalent light and dark hierarchies.
- Compact controls around generous reading space.
- Visible, accessible states for loading, errors, forms, and keyboard interaction.

Authority: `src/app/globals.css`, `components.json`, and the current dashboard/chat components. Product constraints live in `PRODUCT.md`; surface direction lives in `.impeccable/chat-workspace.md`. Local visual evidence: `.local/ui-refactor/{desktop-light-welcome,desktop-dark-welcome,mobile-light-welcome,mobile-dark-conversation}.png`. These screenshots contain synthetic UI fixtures and do not establish live calculation accuracy.

## Colors

Use the semantic variables, allowing `.dark` to change their values. Frontmatter suffixes distinguish theme values; they are documentation keys, not new application variables.

| Role | Application token | Use |
| --- | --- | --- |
| Neutral canvas | `--background`, `--foreground` | Reading surface and main text |
| Raised surface | `--card`, `--popover` | Composer, vessel form, menus; popover matches card |
| Primary action | `--primary`, `--primary-foreground` | Send, stop, and continue controls |
| Quiet surface | `--muted`, `--accent`, `--secondary` | User messages, hover/selected states; these share values |
| Secondary text | `--muted-foreground` | Supporting copy, timestamps/groups, statuses |
| Navigation | `--sidebar` and `--sidebar-*` | Pale neutral sidebar in light; charcoal in dark |
| Maritime accent | `--brand` | Anchor marks, select action icons, links, completion details |
| Boundaries | `--border`, `--input`, `--ring` | Dividers, fields, visible keyboard focus |
| Error | `--destructive` | Error text, alerts, invalid fields |

The primary action is neutral. Teal remains a small accent, not a large background fill. Theme selection offers Light, Dark, and System, persisted by `next-themes` under `plisto-appearance`; non-dashboard routes are currently forced to light.

## Typography

Geist is the shared interface/body family; Geist Mono is for code. Both load through `next/font/google` in the root layout. Use sentence case and normal tracking for reading text.

- Welcome heading: 30px/1.25, medium, tight tracking; 36px from `sm` (640px).
- Header and form titles: 14px/20px, medium; sidebar wordmark: 20px, semibold.
- Messages: 14px/28px. Assistant Markdown headings are semibold; content remains open on the canvas.
- Supporting text: 12px/16px, muted. Welcome support grows from 14px to 16px at `sm`.
- Composer text: 16px below `md` (768px), 14px above; comfortable line height. Small form labels may use medium weight.

## Layout

The workspace occupies `100dvh`. Header height is 64px. Desktop navigation is 248px and collapses off-canvas; below 768px, navigation becomes a 288px Radix Sheet with an explicit close control. Its history scrolls independently of the footer.

Welcome, messages, and composer share a centered 768px maximum outer column with 20px horizontal padding, increasing to 32px at 640px. Welcome content is vertically centered when space permits and can scroll on shorter screens. Prompt actions wrap. Conversation messages scroll above the composer; an explicit button returns readers to the latest message.

Use the existing 4px-based spacing rhythm with half-steps where controls require them. Messages have 32px separation; form sections use 20px padding. User bubbles occupy at most 90% of the column, reducing to 85% at `sm`.

Confine horizontal overflow to code blocks and the focusable, labelled Table region. Response tables have a 448px minimum width; the page itself must remain within the viewport.

## Elevation & Depth

The workspace is flat, separated by neutral tones and thin borders. Composer and form cards have no decorative shadow. Menus use shadcn `shadow-md` plus a subtle ring; the mobile Sheet uses `shadow-lg` over a lightly dimmed, blurred overlay. Exact shadows and motion are recorded in `.impeccable/design.json`.

Standard control transitions are 150ms; sidebar/Sheet movement is 200ms. The workspace and Sheet honor reduced motion; spinning status icons also stop animating under that preference.

## Shapes

The base radius is `--radius: 0.625rem` (10px). Current derived radii are 8px for navigation rows (`md`), 10px for controls (`lg`), 14px for tables/code blocks (`xl`), and 18px for composer, user bubbles, and vessel forms (`2xl`). Send/stop controls are 36px circles; model selection and prompt actions use pill silhouettes. These values describe the built system, including the derived 18px large corner.

## Components

- **Buttons:** Use existing default, outline, ghost, and link variants. Neutral filled controls commit actions; quiet actions remain ghost/outline. Preserve focus rings, disabled opacity, accessible names for icon-only actions, and shadcn keyboard behavior.
- **Navigation:** Plisto anchor/wordmark, New conversation, title search, date-grouped history, and account/appearance menu. Active rows use sidebar accent and medium weight with `aria-current`; long titles truncate with a title attribute. Preserve skeleton, empty, no-match, retry, and sign-out-error states.
- **Composer:** A native form around InputGroup/Textarea, model selector in the footer, send/stop circle at the right. Text grows from 80px to a 200px cap. Enter submits; Shift+Enter adds a line; IME composition must not submit. Empty/loading submission is guarded. During streaming, keep the field readable and offer Stop response.
- **Models:** Show only Model 1 and Model 2 through the shadcn Select. Keep provider identities out of the interface.
- **Messages:** Neutral user bubble; open assistant Markdown with a small Plisto label. Preserve links, code, accessible scrolling tables, tool statuses, and copy feedback. Copy is visible on mobile and appears on hover or keyboard focus on desktop.
- **Vessel forms:** Inline bordered card using labelled shadcn fields/radios. Required fields gate Continue; Cancel and optional context remain available. Submitted/cancelled summaries replace completed forms. A pending form replaces the composer with a continuation status.
- **Feedback:** Use nearby descriptive text and existing Alert/status primitives. Keep failed drafts available, provide history retry, and retain the estimate caveat. Do not present synthetic fixtures as real product data.

## Do's and Don'ts

- **Do** extend existing shadcn primitives and semantic variables.
- **Do** preserve the shared reading column, accessible labels, focus treatment, and both themes.
- **Do** keep tables and code locally scrollable on narrow screens.
- **Do** preserve authentication, saved history, streaming, citations, calculation contracts, and form continuation.
- **Don't** introduce decorative cards around ordinary assistant prose.
- **Don't** expose provider/model identifiers beyond the two public aliases.
- **Don't** add mock names, unsupported integrations, or claims of current tariff accuracy to connected screens.
- **Don't** apply this scoped chat direction as an assumed product-wide rebrand.
\n## Memory controls\n\nThe header Memory button expands an inline, scrollable region above the conversation. Existing neutral tokens, button variants and reading-column alignment are preserved. Saved facts have individual Forget actions; current-chat working notes have a separate section. Forgetting also invalidates notes, while chat history remains. Loading, empty, error/retry and clear-all confirmation states are explicit. Desktop/mobile populated light-theme screenshots are synthetic acceptance data; live behavior evidence is in docs/memory-integration-acceptance.md.\n
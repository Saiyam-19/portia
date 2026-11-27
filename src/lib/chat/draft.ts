/** A question typed on the landing page, carried to the new-chat screen in the same tab (also across sign-in). */
const DRAFT_KEY = "berthwise:draft";

export function saveDraft(text: string) {
  try { sessionStorage.setItem(DRAFT_KEY, text.trim().slice(0, 4000)); } catch { /* storage blocked: the app still opens */ }
}

/** Returns the waiting question once, then forgets it. */
export function takeDraft(): string {
  try {
    const text = sessionStorage.getItem(DRAFT_KEY) ?? "";
    sessionStorage.removeItem(DRAFT_KEY);
    return text;
  } catch { return ""; }
}

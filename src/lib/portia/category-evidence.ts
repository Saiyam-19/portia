import type { QuoteInput } from "./quotes";

const categories: Record<string, RegExp> = {
  "general-cargo": /\bgeneral[ -]cargo\b/i, container: /\bcontainer(?:[ -]ship| vessel| carrier)\b/i,
  tanker: /\btanker\b/i, "ro-ro": /\bro[ -]?ro\b/i, "offshore-supply": /\boffshore[ -]supply\b/i,
  naval: /\bnaval\b/i, "coast-guard": /\bcoast[ -]guard\b/i,
  passenger: /\bpassenger\b/i, cruise: /\bcruise\b/i, other: /\bother vessel (?:type|category)\b/i,
};
const normalize = (text: string) => text.normalize("NFKC").trim().replace(/[.!?;]+$/, "").trim().replace(/\s+/g, " ").toLowerCase();
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const bounded = (text: string) => new RegExp(`(?:^|[^\\p{L}\\p{N}])${escape(text)}(?=$|[^\\p{L}\\p{N}])`, "u");
const negative = /\b(?:not|no|never|neither|nor|except|excluding|unknown|unconfirmed|unspecified|another|other vessel|second vessel|different vessel)\b/i;

/** Validate one proposed enum against its complete human context. A model's
 * excerpt merely locates a unique clause; it cannot remove negation or change
 * its subject. This does not interpret requests or select a tariff branch. */
export function supportsVesselCategory(category: NonNullable<QuoteInput["call"]>["vesselCategory"], evidence: string | undefined, request: string, targetName?: string, singleSavedVessel = true, awaitingCategory = false): boolean {
  if (!category || !evidence) return false;
  const categoryPattern = escape(category).replaceAll("-", category === "ro-ro" ? "[ -]?" : "[ -]");
  const excerpt = normalize(evidence), human = normalize(request);
  const exactCategoryReply = normalize(category).replaceAll("-", " ") === human.replaceAll("-", " ");
  if (awaitingCategory && singleSavedVessel && exactCategoryReply && excerpt === human) return true;
  const clauses = request.split(/[!?;\n]+|\.(?=\s|$)/).map(normalize).filter(Boolean);
  const containing = clauses.filter(clause => bounded(excerpt).test(clause));
  if (containing.length !== 1) return false;
  const clause = containing[0];
  if (negative.test(clause) || !categories[category].test(clause) || Object.values(categories).filter(pattern => pattern.test(clause)).length !== 1) return false;
  // Cargo/handling prose is not a ship classification. A vessel noun or a
  // direct classification predicate must establish the requested category.
  const shipNoun = category === "tanker" ? /\btanker\b/.test(clause) : new RegExp(`${category === "container" ? "container" : categoryPattern}\\s+(?:ship|vessel|carrier)\\b`).test(clause);
  const predicate = new RegExp(`^(?:is|has (?:vessel )?category:?|category:)\\s+(?:(?:a|an|ordinary|fictional|indian[ -]flag|foreign[ -]going|coastal)\\s+)*${categoryPattern}(?=$|\\b)`);
  if (targetName) {
    const subject = new RegExp(`^(?:(?:our|this|the)\\s+)?(?:(?:vessel|ship|quote|quotation)\\s+)?${escape(normalize(targetName))}(?=$|[^\\p{L}\\p{N}])\\s+`, "u").exec(clause);
    if (subject && predicate.test(clause.slice(subject[0].length))) return true;
  }
  const positiveClauses = clauses.filter(value => Object.values(categories).some(pattern => pattern.test(value)) && !negative.test(value));
  const reference = /\b(?:example|illustration|guide|manual|textbook|template|unknown|unconfirmed|unspecified)\b/i;
  // "Each is for a ... vessel" can explicitly classify several named calls.
  // Require the target to occur in the human's name list, not merely elsewhere.
  const namedTarget = targetName && new RegExp(`\\b(?:quotations?|quotes?|calls?|vessels?)\\s+(?:named|called)\\s+[^.!?;\\n]*${escape(normalize(targetName))}(?=$|[^\\p{L}\\p{N}])`, "iu").test(request);
  if (namedTarget && positiveClauses.length === 1 && shipNoun && !reference.test(request) && /^(?:each(?: (?:vessel|ship|call|quotation))? is|both(?: vessels| ships| calls| quotations)? are)\s+(?:for\s+)?(?:a|an)\s+\d+(?:\.\d+)?\s*(?:gt|grt)\b/.test(clause)) return true;
  if (!singleSavedVessel || positiveClauses.length !== 1 || /\b(?:another|second|different) vessel\b/i.test(request)) return false;
  const pronoun = /^(?:(?:she|he|it)|(?:our|this|the) vessel)\s+/.exec(clause);
  if (pronoun && predicate.test(clause.slice(pronoun[0].length))) return true;
  if (!targetName && /^our (?:tanker|general[ -]cargo ship|container ship)\s+(?:is|at)\b/.test(clause)) return true;
  // An unnamed vessel in a concrete request is still an explicit subject.
  // Generic rule explanations never provide a voyage's vessel category.
  if (!targetName && shipNoun && !/\b(?:explain|describe|example|illustration|guide|manual|textbook|template|rule (?:is|applies|covers|for)|applies to|which rule|what rule)\b/.test(clause)) {
    const forVessel = /\bfor\s+(?:a|an|our|my|this|the)\s+/.exec(clause);
    if (forVessel && categories[category].test(clause.slice(forVessel.index + forVessel[0].length))) return true;
    // A unique, explicitly classified vessel with its stated gross tonnage
    // is also a concrete subject in a terse call description.
    if (new RegExp(`(?:^|:)\\s*\\d+(?:\\.\\d+)?\\s*(?:GT|GRT)\\s+(?:(?:ordinary|fictional|foreign[ -]going|coastal|indian[ -]flag)\\s+)*${categoryPattern}\\s+(?:ship|vessel|carrier)\\b`, "i").test(clause)) return true;
    if (new RegExp(`(?:^|:)\\s*(?:(?:ordinary|fictional|foreign(?:[ -]going)?|coastal|indian[ -]flag)\\s+)*${categoryPattern}\\s+(?:ship|vessel|carrier)[,\\s]+\\d+(?:\\.\\d+)?\\s*(?:GT|GRT)\\b`, "i").test(clause)) return true;
    const vesselNoun = category === "tanker" ? "" : "\\s+(?:ship|vessel|carrier)";
    if (new RegExp(`\\b(?:(?:ordinary|fictional|foreign(?:[ -]going)?|coastal|indian[ -]flag)\\s+)+${categoryPattern}${vesselNoun}[,\\s]+\\d+(?:\\.\\d+)?\\s*(?:GT|GRT)\\b`, "i").test(clause)) return true;
  }
  return false;
}

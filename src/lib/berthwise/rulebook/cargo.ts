/** The cargo kinds Berthwise prices wharfage for: the main cargoes at the ports it covers.
 * Each port's schedule names cargo its own way; the rule book maps its rows onto these.
 * A kind with a parent (coking coal, diesel) uses the parent's rate where the port's
 * schedule has no separate row for it. */
export const CARGO_CLASSES = {
  containers: { label: "containers", hint: "loaded containers, priced per 20-foot and 40-foot box" },
  coal: { label: "coal", hint: "coal and coke, including steam (thermal) coal" },
  "coking-coal": { label: "coking coal", parent: "coal" },
  "iron-ore": { label: "iron ore", hint: "iron ore fines, lumps and pellets" },
  fertilizer: { label: "fertiliser", hint: "finished fertilisers such as urea, DAP, MOP and NPK" },
  "fertilizer-raw-materials": { label: "fertiliser raw materials", hint: "rock phosphate, sulphur" },
  steel: { label: "steel", hint: "iron and steel products: coils, plates, pipes, billets" },
  "crude-oil": { label: "crude oil" },
  "petroleum-products": { label: "oil products", hint: "petroleum products (POL) when the product isn't named" },
  diesel: { label: "diesel", parent: "petroleum-products", hint: "HSD, gas oil, light diesel oil" },
  petrol: { label: "petrol", parent: "petroleum-products", hint: "motor spirit, gasoline" },
  naphtha: { label: "naphtha", parent: "petroleum-products" },
  "fuel-oil": { label: "fuel oil", parent: "petroleum-products", hint: "furnace oil" },
  "jet-fuel": { label: "jet fuel and kerosene", parent: "petroleum-products", hint: "ATF, superior kerosene oil" },
  lpg: { label: "LPG", hint: "propane, butane" },
  lng: { label: "LNG" },
  chemicals: { label: "liquid chemicals", hint: "acids, ammonia, methanol and other liquid chemicals in bulk" },
  "edible-oil": { label: "edible oil", hint: "palm, soya and other vegetable oils" },
  "food-grains": { label: "food grains", hint: "grains, pulses, rice, wheat" },
  cement: { label: "cement and clinker" },
} as const satisfies Record<string, { label: string; hint?: string; parent?: string }>;

export type CargoClass = keyof typeof CARGO_CLASSES;
export const CARGO_CLASS_IDS = Object.keys(CARGO_CLASSES) as [CargoClass, ...CargoClass[]];

export const cargoLabel = (id: string) => (CARGO_CLASSES as Record<string, { label: string }>)[id]?.label ?? id.replace(/-/g, " ");
export const cargoParent = (id: string): string | undefined => (CARGO_CLASSES as Record<string, { parent?: string }>)[id]?.parent;

/** Words that name each kind, most specific first ("crude palm oil" is edible oil, "coking coal" isn't steam coal). */
const WORDS: Array<[CargoClass, RegExp]> = [
  ["edible-oil", /edible|palm|soya|soybean oil|vegetable oil|sunflower|rapeseed oil|canola/],
  ["coking-coal", /coking|met(?:allurgical)? coke|met coal/],
  ["fertilizer-raw-materials", /rock phosphate|sulphur|sulfur|fertili[sz]er raw|\bfrm\b/],
  ["fertilizer", /fertili[sz]er|\burea\b|\bdap\b|\bmop\b|\bnpk\b|potash/],
  ["lpg", /\blpg\b|propane|butane/],
  ["lng", /\blng\b/],
  ["diesel", /diesel|\bhsd\b|gas ?oil|\bldo\b|\bmgo\b/],
  ["petrol", /petrol|gasoline|motor spirit|mogas/],
  ["naphtha", /naphtha|naptha/],
  ["fuel-oil", /fuel oil|furnace oil|\bhsfo\b|\bvlsfo\b|\blsfo\b|\bfo\b/],
  ["jet-fuel", /jet fuel|\batf\b|kerosene|\bsko\b|jet a/],
  ["petroleum-products", /petroleum|oil products?|\bpol\b|refined products?|clean products?/],
  ["crude-oil", /crude/],
  ["chemicals", /chemical|acid|ammonia|methanol|caustic|\bedc\b|benzene|xylene/],
  ["steel", /steel|coils?\b|\bhrc\b|\bcrc\b|billets?|pig iron|sponge iron|\bplates\b|\bpipes\b/],
  ["iron-ore", /iron ore|\bore\b|pellets?|iron fines/],
  ["coal", /coal|\bcoke\b/],
  ["containers", /containers?|\bteu\b|\bfeu\b|\bboxes\b/],
  ["food-grains", /grains?|wheat|rice|maize|\bcorn\b|pulses|lentils?|barley|soybeans?|peas\b/],
  ["cement", /cement|clinker/],
];

/** The cargo kind a phrase names ("steam coal" is coal), if it is one we price. */
export function cargoKind(text: string): CargoClass | undefined {
  const lower = text.toLowerCase().replace(/[_-]+/g, " ");
  if ((CARGO_CLASS_IDS as string[]).includes(text)) return text as CargoClass;
  return WORDS.find(([, pattern]) => pattern.test(lower))?.[0];
}

/** Whether the user's words name this kind of cargo. */
export function namesCargo(kind: string, words: string): boolean {
  const lower = words.toLowerCase();
  // Naming a product names its group too ("diesel" is an oil product).
  const kinds = WORDS.filter(([id]) => id === kind || cargoParent(id) === kind);
  return kinds.length ? kinds.some(([, pattern]) => pattern.test(lower)) : lower.includes(kind.toLowerCase().replace(/-/g, " "));
}

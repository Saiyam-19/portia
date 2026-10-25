import type { Estimate } from "./rulebook/calculate";
import type { CoverageRow, TariffView } from "./rulebook/describe";
import type { FleetShip } from "./fleet";
import type { AgreedView } from "./agreed-rates";

/** Shapes of the cards the Berthwise tools return. Shared by the tools (server)
 * and the chat screen (client); type-only, so nothing server-side is bundled. */

export type Total = { currency: string; amount: string; display: string };
export type ShipView = { name?: string; imo?: string; grt?: string; nrt?: string; loa?: string; type?: string; status?: string };

export type EstimateCall = { role?: "departure" | "arrival"; estimate: Estimate; notices?: string[]; agreed?: AgreedView; exchangeRate?: string; notes: string[] };
export type EstimateCard = {
  kind: "estimate"; ship: ShipView; calls: EstimateCall[]; voyageTotals?: Total[]; fromFleet?: string[];
  inRupees?: { usdToInr: string; calls: Array<{ port: string; total?: Total }>; voyage?: Total };
};

export type ComparisonCell = { totals: Total[]; lines: string[] } | { missing: string } | null | undefined;
export type ComparisonCard = {
  kind: "comparison"; view: "berth-hire" | "whole-bill"; ship: ShipView; date?: string; hoursAlongside?: string;
  ports: Array<Pick<Estimate, "port" | "terminal" | "berth" | "version" | "totals" | "assumptions" | "questions" | "notCovered" | "checkedOn">>;
  rows: Array<{ key: string; label: string; cells: ComparisonCell[] }>;
  estimates: Estimate[]; ranking?: Array<{ port: string; total: Total }>; usdToInr?: string; notRanked?: string;
};

export type TariffCard = { kind: "tariff" } & TariffView;
export type TariffComparisonCard = {
  kind: "tariff-comparison"; ship: ShipView; date: string;
  ports: Array<TariffView | { port: { id: string; name: string }; missing: string }>;
};
export type CoverageCard = { kind: "coverage"; date: string; ports: CoverageRow[] };

export type DocumentExcerpt = {
  port: { id: string; name: string }; title: string; issuer: string; url: string; page: number;
  kind: "tariff" | "rules"; publishedOn?: string; retrievedOn: string; excerpt: string;
};
export type DocumentExcerptsCard = { kind: "document-excerpts"; question: string; port?: { id: string; name: string }; results: DocumentExcerpt[] };

export type ShipCard = { kind: "ship"; ship: FleetShip; saved?: "created" | "updated" };
export type FleetCard = { kind: "fleet"; ships: FleetShip[] };

export type CompanyExcerptsCard = { kind: "company-excerpts"; question: string; results: Array<{ documentId: string; title: string; fileName: string; page: number; text: string }> };

export type BerthwiseCard = EstimateCard | ComparisonCard | TariffCard | TariffComparisonCard | CoverageCard | DocumentExcerptsCard | ShipCard | FleetCard | CompanyExcerptsCard;

/** Charge types grouped the way people read a port bill. */
export const CHARGE_GROUPS: Array<{ key: string; label: string; types: string[] }> = [
  { key: "port-dues", label: "Port dues", types: ["port-dues"] },
  { key: "pilotage", label: "Pilotage and towage", types: ["pilotage", "towage", "pilotage-towage"] },
  { key: "berth-hire", label: "Berth hire", types: ["berth-hire"] },
  { key: "mooring", label: "Mooring", types: ["mooring"] },
  { key: "anchorage", label: "Anchorage", types: ["anchorage"] },
  { key: "wharfage", label: "Wharfage", types: ["wharfage"] },
  { key: "other", label: "Other charges", types: ["other"] },
];

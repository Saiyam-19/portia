import "server-only";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../convex/_generated/api";
import type { MigrationTokenManager } from "../migration/bridge";
import { migrationServerConfig } from "../migration/config";
import type { AgreedRate } from "./agreed-rates";
import type { FleetAccess, FleetShip } from "./fleet";

/** What the chat tools may read and write for the signed-in company. */
export type CompanyHit = { documentId: string; title: string; fileName: string; page: number; text: string };
export type CompanyAccess = { search: (question: string) => Promise<CompanyHit[]>; agreedRates: () => Promise<AgreedRate[]> };

/** The signed-in user's company data, read and written as that user (Convex checks ownership). */
export function convexAccount(manager: MigrationTokenManager): { fleet: FleetAccess; company: CompanyAccess } {
  const client = () => {
    const convex = new ConvexHttpClient(migrationServerConfig().convexUrl);
    convex.setAuth(manager.getToken());
    return convex;
  };
  return {
    fleet: {
      list: async () => await client().query(api.fleet.listShips, {}) as FleetShip[],
      save: async ship => await client().mutation(api.fleet.saveShip, { ship }),
    },
    company: {
      search: async question => await client().query(api.companyDocs.searchDocuments, { question }),
      agreedRates: async () => await client().query(api.agreedRates.listAgreedRates, {}),
    },
  };
}

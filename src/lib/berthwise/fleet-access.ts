import "server-only";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../convex/_generated/api";
import type { MigrationTokenManager } from "../migration/bridge";
import { migrationServerConfig } from "../migration/config";
import type { FleetAccess, FleetShip } from "./fleet";

/** The signed-in user's fleet, read and written as that user (Convex checks ownership). */
export function convexFleet(manager: MigrationTokenManager): FleetAccess {
  const client = () => {
    const convex = new ConvexHttpClient(migrationServerConfig().convexUrl);
    convex.setAuth(manager.getToken());
    return convex;
  };
  return {
    list: async () => await client().query(api.fleet.listShips, {}) as FleetShip[],
    save: async ship => await client().mutation(api.fleet.saveShip, { ship }),
  };
}

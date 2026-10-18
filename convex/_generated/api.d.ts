/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as auth from "../auth.js";
import type * as http from "../http.js";
import type * as lib_authority from "../lib/authority.js";
import type * as lib_memoryLifecycle from "../lib/memoryLifecycle.js";
import type * as lib_migrationGate from "../lib/migrationGate.js";
import type * as memory from "../memory.js";
import type * as memoryHttp from "../memoryHttp.js";
import type * as memoryValidators from "../memoryValidators.js";
import type * as migration from "../migration.js";
import type * as validators from "../validators.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  auth: typeof auth;
  http: typeof http;
  "lib/authority": typeof lib_authority;
  "lib/memoryLifecycle": typeof lib_memoryLifecycle;
  "lib/migrationGate": typeof lib_migrationGate;
  memory: typeof memory;
  memoryHttp: typeof memoryHttp;
  memoryValidators: typeof memoryValidators;
  migration: typeof migration;
  validators: typeof validators;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  agent: import("@convex-dev/agent/_generated/component.js").ComponentApi<"agent">;
  betterAuth: import("@convex-dev/better-auth/_generated/component.js").ComponentApi<"betterAuth">;
};

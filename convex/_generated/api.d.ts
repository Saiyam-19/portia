/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as agent from "../agent.js";
import type * as artifacts from "../artifacts.js";
import type * as auth from "../auth.js";
import type * as conversations from "../conversations.js";
import type * as http from "../http.js";
import type * as lib_artifacts from "../lib/artifacts.js";
import type * as lib_chat from "../lib/chat.js";
import type * as lib_gate from "../lib/gate.js";
import type * as lib_memory from "../lib/memory.js";
import type * as validators from "../validators.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  agent: typeof agent;
  artifacts: typeof artifacts;
  auth: typeof auth;
  conversations: typeof conversations;
  http: typeof http;
  "lib/artifacts": typeof lib_artifacts;
  "lib/chat": typeof lib_chat;
  "lib/gate": typeof lib_gate;
  "lib/memory": typeof lib_memory;
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
  betterAuth: import("@convex-dev/better-auth/_generated/component.js").ComponentApi<"betterAuth">;
};

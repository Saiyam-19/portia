import { httpRouter } from "convex/server";
import { authComponent, createAuth } from "./auth";
import { portiaEnabled } from "./lib/gate";

const http = httpRouter();

if (portiaEnabled()) {
  authComponent.registerRoutes(http, createAuth);
}

export default http;

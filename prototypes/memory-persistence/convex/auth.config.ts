import type { AuthConfig } from "convex/server";
// Local integration harness installs an ephemeral public JWK. No user auth migration.
export default {
  providers: [{
    type: "customJwt", issuer: "https://memory-prototype.test",
    applicationID: "memory-prototype", algorithm: "RS256",
    jwks: process.env.MEMORY_PROTOTYPE_JWKS!,
  }],
} satisfies AuthConfig;

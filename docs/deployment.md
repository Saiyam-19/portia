# Portia runtime deployment

The app deploys as one Next.js site plus the explicitly selected Convex deployment. The old Python API is not part of the serving path. `data/ports/**/*` is included in tracing for canonical and compatibility chat routes. Keep runtime credentials server-side.

Configure the values in `.env.example` in the frontend environment. Configure Convex `PORTIA_ENABLED=true`, `PORTIA_CONVEX_DEPLOYMENT=<slug>`, `PORTIA_AUTH_MODE=basic|private`, `SITE_URL=<frontend origin>`, `PORTIA_SERVER_SECRET`, and `BETTER_AUTH_SECRET`. Convex provides `CONVEX_SITE_URL`; it must match the named deployment. `MIGRATION_DEV_ENABLED=true` remains accepted as a legacy enable flag, but no deployment name is hardcoded.

Basic auth permits unverified fresh email/password signup, explicitly chosen for this release. Do not claim verified address ownership or working password-recovery email. Private mode requires `MIGRATION_ALLOWED_EMAILS`; provisioning also needs the server secret header. Preserve session secrets/cookie prefix during compatible updates. Authentication is checked live in the server dashboard layout, client provider readiness gate and each Convex access path; middleware alone does not grant access.

Request limits are atomic rolling windows in an indexed bounded table: defaults 8 inference starts/minute, 60/hour; 6 empty chat creations/minute, 30/hour. Configurable maxima are capped at 20/minute and 120/hour. Replayed requests do not consume another allowance. Limits apply in private and basic modes, and deletion cannot reset usage. Better Auth additionally uses database-backed endpoint throttles (8 email signins/minute, 4 signups/minute). This is a per-account/request budget, not a monetary billing system.

No live push, production cutover, or provider changes are performed by an ordinary build. Before any cloud write, verify the account, project, deployment/environment and rollback artifact. Build, deployed functions, browser journeys, real inference and production traffic are separate evidence gates.

Acceptance to verify on the chosen DEV deployment: signup/signin/signout; saved initial question; both aliases; GRT form, note, cancellation, reload; historical tariff calculation and citations; cross-owner access denial; cross-tab Stop; deletion and late-write fencing; rate/replay behavior; unknown legacy URLs; responsive light/dark UI. Local implementation checks do not replace this live acceptance.

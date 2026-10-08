# Deployment and operations

## Vercel project layout

Deploy the frontend and backend as **separate projects**:

| Project | Root directory | Configuration |
| --- | --- | --- |
| Frontend | Repository root | `vercel.json`, Next.js build |
| API | `backend` | `backend/vercel.json`, FastAPI, Python 3.12 |

The API configuration includes `ports/**` and sets a 300-second function duration. The frontend upload excludes the backend and local evidence. Vercel project-link files are intentionally ignored; a fresh clone must be linked to the intended project/account before any deployment.

This GitHub publication does not change existing hosted deployments or copy local secrets to a hosting provider. Apply the new model configuration to the API environment before deploying the selector release.

## Environment

Frontend:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `NEXT_PUBLIC_BACKEND_URL` — HTTPS API origin
- `NEXT_PUBLIC_ENABLE_GOOGLE_AUTH=false` until the provider is configured

Backend:

- `SUPABASE_URL`
- `SUPABASE_SECRET_KEY`
- `OPENROUTER_API_KEY`
- `LLM_ALLOW_PAID=true`
- `LLM_MAX_TOKENS=4096` unless intentionally adjusted
- `ALLOWED_ORIGINS` — exact frontend origin, comma-separated for multiple approved origins
- Optional: `SUPABASE_JWKS_URL`, `VESSEL_API_KEY`

Keep the main and specialist selections in the server-only model mapping. Chat aliases use OpenRouter; the optional legacy `LLM_PROVIDER`, `MAIN_MODEL`, and `PORT_MODEL` settings apply to direct model-factory calls without an alias, not the selector.

Configure Supabase Site URL and allowed callback URLs for the frontend. Match email delivery and OAuth settings to the intended audience. Public Next.js environment values are bundled at build time, so rebuild after changing them.

## Release verification

1. Run the README's build, lint, and offline test commands.
2. Confirm both hosting targets and their environments. Deploy the API and then the frontend through the selected Vercel projects.
3. Check `/health` and `/ready`; neither verifies model inference or database connectivity.
4. In an authenticated browser, start a clearly labeled synthetic conversation with each selector option. Check a follow-up, a form reply, and saved history after reload.
5. Verify anonymous and other-user access is denied. Remove only the temporary test accounts and data created for that verification.

Do not treat earlier free-model acceptance results as verification of a new model or deployment. Roll back each hosting project to its previously verified deployment if needed; preserve matching frontend/API configuration.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Login unavailable | Frontend Supabase URL and publishable key; rebuild after changing public values |
| HTTP 401 | Matching Supabase project, valid user session, issuer/audience, and ES256/RS256 JWKS signing |
| Browser cannot reach API | Backend URL and exact CORS origin, including local port |
| `/ready` returns 503 | Missing backend credentials or paid-model opt-in |
| Chat fails despite `/ready` 200 | Server logs, provider credit/limits, routing eligibility, database access |
| OpenRouter HTTP 402 | Account credits and key spending limits; a valid key is insufficient |
| No eligible provider | Required parameters and configured `data_collection=deny` / `zdr=true` routing |
| Requests time out | Ask about one port at a time; full reference documents increase context and latency |
| Signup email missing | Supabase sender configuration, delivery logs, and recipient eligibility |

## Other deployment files

`backend/Dockerfile` installs the Poetry lockfile and starts Uvicorn on port 8080. Supply environment variables at runtime; never bake credentials into an image. `backend/fly.toml` is an inherited configuration for an existing named app; inspect and replace its target before using it for a separate deployment.

## Secrets and repository hygiene

- Commit only blank/example environment files, never real keys, tokens, or test-user credentials.
- Keep `.local/`, `.vercel/`, `.env*` (except examples), virtual environments, caches, and local assistant settings excluded.
- Provider errors and logs can contain operational details. Do not expose backend logs or developer documentation as customer-facing model-selection metadata.
- After changing models, rerun both selection paths, specialist routing, and form continuation checks.

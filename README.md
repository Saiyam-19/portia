# Portia

Portia (also branded Plisto in the app) is a maritime assistant for exploring port tariffs, estimating charges, and comparing supported Indian ports and terminals.

Built with **Next.js 16 / React 19**, **FastAPI / LangGraph**, **Supabase**, and **OpenRouter**.

## Features

- Authenticated chat with streamed responses and saved conversation history.
- Port-specific specialist agents backed by 16 bundled tariff document sets.
- Structured follow-up forms for missing voyage or vessel details.
- Bounded Decimal arithmetic for charge calculations.
- Optional VesselAPI lookup; manual vessel particulars when it is not configured.
- Two chat options, **Model 1** and **Model 2**, with provider mappings confined to the backend.
- Per-user conversation access enforced by the API and Supabase row-level security.

Tariffs are static reference documents, including historical schedules. Results are estimates and require checking against current port-authority rules; this is not a live global tariff database.

## Quick start

### Requirements

- Node.js 20.9+ and npm.
- Python 3.12+ and Poetry 2.4.1. Deployment is configured for Python 3.12.
- A Supabase project with asymmetric JWT signing (ES256 or RS256).
- An OpenRouter API key with credit available for the selected paid models.

Inspect existing processes and ports before starting servers; reuse compatible instances. The examples use frontend port **3001** and backend port **8080**.

### 1. Install dependencies

```bash
git clone https://github.com/Saiyam-19/portia.git
cd portia
npm ci

python3 -m venv backend/.venv
backend/.venv/bin/pip install poetry==2.4.1
cd backend
.venv/bin/poetry install --no-root
cd ..
```

### 2. Configure local environment

For a fresh clone, copy the examples. Preserve existing configured files.

```bash
cp .env.example .env.local
cp backend/.env.example backend/.env
chmod 600 .env.local backend/.env
```

Fill the following values:

| File | Variable | Purpose |
| --- | --- | --- |
| `.env.local` | `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `.env.local` | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Public publishable/anon key |
| `.env.local` | `NEXT_PUBLIC_BACKEND_URL` | Local API URL, `http://localhost:8080` |
| `backend/.env` | `SUPABASE_URL` | Same Supabase project URL |
| `backend/.env` | `SUPABASE_SECRET_KEY` | Server secret/service-role key |
| `backend/.env` | `OPENROUTER_API_KEY` | Server-side model access |
| `backend/.env` | `LLM_ALLOW_PAID` | Must be `true` for the two chat models |
| `backend/.env` | `ALLOWED_ORIGINS` | Frontend origin, `http://localhost:3001` |

Optional settings are described in the example files. Keep Google login disabled unless its Supabase provider is configured. Never put server secrets in `NEXT_PUBLIC_*` variables.

### 3. Configure Supabase

For a **new, empty project**, run [`supabase/schema.sql`](supabase/schema.sql) once in the SQL editor. It creates the conversation/message tables, indexes, timestamp trigger, and ownership policies. It is not a repeatable migration: policy creation will fail if applied again unchanged. Do not reapply it to an already configured database.

Enable email/password authentication. Set the local Site URL to `http://localhost:3001` and allow `http://localhost:3001/auth/callback`. Use matching URLs for hosted environments. Configure an email sender for the intended signup audience and enable Google only when its provider and callback configuration are ready.

The backend verifies JWT signatures through the project's JWKS endpoint and checks issuer, audience, expiry, and authenticated role. It does not support legacy HS256 tokens.

### 4. Run

Frontend, from the repository root:

```bash
npm run dev -- --port 3001
```

Backend, in a second terminal:

```bash
cd backend
.venv/bin/python -m uvicorn main:app --host 127.0.0.1 --port 8080
```

Open [localhost:3001](http://localhost:3001), create/sign in to an app account, and start a conversation. A Supabase dashboard account is separate from an app account.

### UI preview (no backend)

The redesigned chat interface runs fully mocked at `/chat` — no Supabase, OpenRouter key, or backend needed:

```bash
npm ci
npm run dev -- --port 3001
```

Open [localhost:3001/chat](http://localhost:3001/chat). A scripted agent (`src/lib/portia/engine.ts`) simulates thinking, tool calls, a structured input form, streamed answers, estimates, stop, and a failure/retry state. Try the suggestion cards, `/` commands, or `@` port mentions; the theme switch is in the sidebar footer.

## Model selection

The UI shows only **Model 1** and **Model 2**. The backend maps them in [`backend/models.py`](backend/models.py); both the main agent and port specialists use the chosen model. The browser remembers each conversation's selection locally. No provider model IDs or API keys are sent as selector data.

Selections apply to the initial question, follow-ups, and form responses. The selector is disabled during a request. Only the two public aliases are accepted by the API.

The current models require OpenRouter credits. A valid key alone does not establish that inference can run. Requests also require provider support for the configured parameters and zero-data-retention routing. See [deployment and operations](docs/deployment.md) for checks and troubleshooting.

## Checks

From the repository root:

```bash
npm run lint
npm run build
PYTHONPATH=backend backend/.venv/bin/python -m unittest test_runtime test_model_selection -v
```

The production build fetches Google Fonts and needs network access. The two backend suites run offline with synthetic fixtures and mocks; they cover arithmetic bounds, authentication, model routing, cache separation, concurrent selections, form routing, streaming, and generic configuration errors.

`backend/test_vesselapi.py` is a manual integration script requiring `VESSEL_API_KEY`; do not include it in the offline unittest discovery command.

A build or offline test pass does not establish working email delivery, model inference, persistence, or tariff accuracy. Verify the authenticated browser journey separately after provisioning services.

## Repository layout

```text
src/app/                 Pages, auth callback, dashboard, chat
src/components/          Chat UI, structured forms, navigation
src/components/portia/   Redesigned agentic chat UI (mocked at /chat)
src/components/ui/       Shared buttons, menus, toasts, motion, theme
src/lib/                 Public model aliases and Supabase clients
src/lib/portia/          Chat state, mock agent engine, seed data
src/proxy.ts             Session refresh and protected-route redirects
backend/agent.py         Main and port-specialist agents, tools, streaming
backend/main.py          Authenticated FastAPI endpoints and persistence
backend/models.py        Private provider mapping and model settings
backend/ports/           Static port/terminal reference documents
backend/test_*.py        Offline tests and manual VesselAPI probe
supabase/schema.sql      Fresh-project schema and ownership policies
docs/                    Architecture and deployment notes
```

## Documentation

- [Architecture and API](docs/architecture.md)
- [Deployment and operations](docs/deployment.md)

Local environment files, credentials, virtual environments, build output, Vercel project links, assistant settings, and delivery evidence are excluded from Git. No open-source license is declared; do not assume redistribution rights for application code or bundled tariff documents.

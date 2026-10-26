# Berthwise

A chat assistant for marine companies. It estimates and compares port-call costs at 12 Indian ports from each port's published rate schedule, including cargo charges (wharfage), answers questions from the ports' own documents and the company's uploaded documents, and remembers the company's ships and agreed rates.

Live: https://portia-berthing.vercel.app. The plan is [docs/berthwise-plan.md](docs/berthwise-plan.md); the handover pack is [docs/handover/README.md](docs/handover/README.md).

## Stack

Next.js 16, AI SDK 7 and OpenRouter (Azure only, no data retention); Convex for accounts, chats, the fleet, company documents and agreed rates; Better Auth for email/password accounts. See [architecture](docs/architecture.md) and [deployment](docs/deployment.md).

## Where things are

| What | Where |
|---|---|
| Port rule book (one reviewed file per port) | `data/rulebook/`, format in [docs/rulebook-format.md](docs/rulebook-format.md) |
| Ports' documents (Markdown copies of the official PDFs) | `data/sources/<port>/` |
| Calculator, tools and answer checks | `src/lib/berthwise/` |
| Agent instructions and model | `src/lib/migration/domain-agent.ts`, `src/lib/migration/model.ts` |
| Convex functions and schema | `convex/` |
| How the rule book was read and checked | [rulebook-resolutions.md](docs/rulebook-resolutions.md), [wharfage-resolutions.md](docs/wharfage-resolutions.md) |

## Local setup

Use Node 22, `npm install`, and the variables in [.env.example](.env.example). Then:

```bash
npm run dev -- --port 3002
```

Checks: `npm test`, `npx tsc --noEmit` and `npm run build`. The everyday questions run against the real model and cost money (about US$ 0.8 a run on Sol):

```bash
npx vitest run --config vitest.eval.config.ts
```

## Chat memory

See [chat memory integration](docs/memory-integration.md), [local acceptance](docs/memory-integration-acceptance.md) and [production acceptance](docs/memory-production-acceptance.md).

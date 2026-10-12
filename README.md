# Signal: Timed Funding Outreach Engine

Every morning Signal finds startups that announced a **pre-seed / seed** round in the last 24–48 hours, rejects the ones that don't fit, researches the ones that do, and drafts a personal outreach email for each. Rohit approves every email before it is sent.

> Status: **Phase 1, scaffold.** Layout, design tokens and empty pages are live. The database and pipeline stages are added in later phases.

## Stack

Next.js 15 (App Router, TypeScript) · Tailwind CSS v4 · shadcn/ui (Radix) · lucide-react · Recharts · Neon + Drizzle · Gemini Flash (`@google/genai`) · Jina Reader · Tavily · Resend · HubSpot · Vercel Cron

## Local setup

```bash
npm install
cp .env.example .env.local   # fill in keys
npm run dev
```

Secrets live only in `.env.local` (git-ignored) and Vercel environment variables.

## Components map

| Area | Path |
|---|---|
| App shell (sidebar, top bar, mobile nav) | `components/shell/*`, `app/layout.tsx` |
| Shared UI (status pill, KPI card, empty/error states, skeletons) | `components/signal/*` |
| shadcn primitives | `components/ui/*` |
| Pages | `app/{page,pipeline,outreach,leads,thesis,analytics,settings}` |
| "Run pipeline now" | `components/shell/run-pipeline-button.tsx` → `app/api/pipeline/run` |

## Decisions and notes

- **Separate repo.** Signal lives in its own repository, not inside any existing project.
- **Light theme only.** Dark mode is optional in the spec and is skipped for now.
- **shadcn CLI quirk.** The CLI rewrote `@/lib/utils` imports to a stray npm package called `cn`. Imports were repointed to `lib/utils.ts` and that package removed. `shadcn` stays as a dev dependency only for its `shadcn/tailwind.css` variants.
- **Dynamic rendering.** All pages render per request (`force-dynamic`) because they read live data from Neon.

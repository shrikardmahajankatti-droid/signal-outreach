# Signal: Timed Funding Outreach Engine

Every morning Signal finds startups that announced a **pre-seed / seed** round in the last 24–48 hours, rejects the ones that don't fit, researches the ones that do, and drafts a personal outreach email for each. Rohit approves every email before it is sent.

> Status: **Phase 3, ingest.** Live news is pulled from RSS feeds, GNews, NewsData.io and investor portfolio pages, de-duplicated, and shown on the Pipeline page. Extraction and qualification come next.

## Stack

Next.js 15 (App Router, TypeScript) · Tailwind CSS v4 · shadcn/ui (Radix) · lucide-react · Recharts · Neon + Drizzle · Gemini Flash (`@google/genai`) · Jina Reader · Tavily · Resend · HubSpot · Vercel Cron

## Local setup

```bash
npm install
cp .env.example .env.local   # fill in keys (at least DATABASE_URL)
npm run db:migrate           # apply drizzle/*.sql to Neon
npm run setup                # load thesis + rules from qualification.md, seed sources/investors
npm run dev
```

Run a stage locally without the UI: `npm run stage -- ingest` (or `-- all`).

`npm run setup` is idempotent and never overwrites edits made in the UI. Use `npm run setup -- --force` to reload config, thesis and email rules from the files.

## Database

Schema: `db/schema.ts`. Migrations: `drizzle/` (generated with `npm run db:generate`, applied with `npm run db:migrate`).

| Table | Purpose |
|---|---|
| `sources`, `investors` | News feeds / API queries and investor portfolio pages (with last snapshot for diffing) |
| `articles` | Every fetched article, unique by `url_hash` |
| `startups` | One row per company: unique `root_domain`, with a partial unique index on `normalized_name` when there is no domain |
| `startup_sources` | Many articles → one startup (merged coverage) |
| `founders` | Founder name, title, LinkedIn URL + match confidence |
| `drafts` | One draft per startup (`startup_id` is unique), with validator `checks` |
| `followups` | Day 3 / 7 / 14 follow-ups per draft |
| `contacted`, `do_not_contact` | Dedupe and suppression lists |
| `thesis` | Single active row (partial unique index on `active`) |
| `qualification_config` | Key/value rules from `qualification.md` section 7 |
| `email_rules` | Subject/body limits, banned phrases, spam words, footer |
| `app_settings` | Accelerator profile, demo/test-inbox overrides |
| `qualification_log` | Every decision with reason codes and a config snapshot |
| `feedback`, `runs`, `events` | Fit feedback, per-stage run records, startup timeline / activity feed |

Secrets live only in `.env.local` (git-ignored) and Vercel environment variables.

## Components map

| Area | Path |
|---|---|
| App shell (sidebar, top bar, mobile nav) | `components/shell/*`, `app/layout.tsx` |
| Shared UI (status pill, KPI card, empty/error states, skeletons) | `components/signal/*` |
| shadcn primitives | `components/ui/*` |
| Pages | `app/{page,pipeline,outreach,leads,thesis,analytics,settings}` |
| Config loader (fresh on every run) | `lib/config.ts` |
| `qualification.md` parser | `lib/qualification/parse-md.ts` |
| Setup (step 0) | `scripts/setup.ts` |
| Ingest stage | `lib/pipeline/ingest.ts` (+ fetchers in `lib/ingest/*`) |
| Stage registry / run records | `lib/pipeline/stages.ts`, `lib/pipeline/runs.ts` |
| Cron routes (one per stage) | `app/api/cron/[stage]/route.ts` → `/api/cron/ingest`, … |
| URL / domain / name normalisation | `lib/domain.ts` |
| Pipeline canvas + stage drawer | `components/pipeline/flow.tsx`, `lib/pipeline/overview.ts` |
| "Run pipeline now" | `components/shell/run-pipeline-button.tsx` → `app/api/pipeline/run` |

## Decisions and notes

- **Separate repo.** Signal lives in its own repository, not inside any existing project.
- **Light theme only.** Dark mode is optional in the spec and is skipped for now.
- **shadcn CLI quirk.** The CLI rewrote `@/lib/utils` imports to a stray npm package called `cn`. Imports were repointed to `lib/utils.ts` and that package removed. `shadcn` stays as a dev dependency only for its `shadcn/tailwind.css` variants.
- **Dynamic rendering.** All pages render per request (`force-dynamic`) because they read live data from Neon.
- **Config beyond section 7.** `qualification.md` describes some numbers in prose (soft-signal penalties, the ≤ $3M size proxy, FX). These are stored as extra `qualification_config` keys (`penalty_*`, `bonus_serial_founder`, `soft_age_years`, `small_round_proxy_usd`, `fx_per_usd`, `flag_stages`) so nothing is hard-coded.
- **Accelerator profile.** Emails need an accelerator name and offer. A placeholder profile ("Launchpad Accelerator") is stored in `app_settings.accelerator_profile`. Replace it with the real one.
- **Neon region.** The project is in `aws-ap-southeast-1` (Singapore), the closest region to India.
- **Ingest pre-filter.** Before anything reaches Gemini, ingest keeps only items whose title or snippet mentions raising money (raises, seed, round, crore…) and that are no older than `late_catch_days`. G1 is still decided by Gemini extraction.
- **Dedupe at ingest.** Articles are unique by canonical-URL hash (tracking params stripped). A normalised-title hash also catches the same story syndicated under different URLs (e.g. Google News redirect links).
- **Investor portfolio diff.** Each portfolio page is read through Jina Reader, and company identifiers are taken from the links on it (external domains, or single-path slugs on the investor's own site). The first read is a baseline. After that, newly listed companies become `portfolio` articles. Inflection Point Ventures' page renders its portfolio client-side, so its snapshot only captures navigation links. 100X.VC's portfolio URL returns 404, so it is deactivated rather than deleted.
- **Missing API keys.** A source whose key isn't set (GNews, NewsData) is counted as `sources_skipped`, not as a failure.
- **Cron route shape.** One dynamic route, `app/api/cron/[stage]`, serves `/api/cron/ingest`, `/api/cron/extract`, and so on. Each checks `Authorization: Bearer $CRON_SECRET`. "Run pipeline now" calls the stages in-process, so the secret never reaches the browser.

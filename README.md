# Signal: Timed Funding Outreach Engine

Every morning Signal finds startups that announced a **pre-seed / seed** round in the last 24–48 hours, rejects the ones that don't fit, researches the ones that do, and drafts a personal outreach email for each. Rohit wakes up to a short list of ready-to-approve emails. He never sees rejected startups, and **nothing is sent until he clicks Approve**.

- **Live app:** https://signal-outreach-seven.vercel.app
- **Rules (source of truth):** [`qualification.md`](qualification.md)
- **Demo data:** [`data/demo_startups.json`](data/demo_startups.json)

## How it works (steps 0–10)

| Step | What happens | Where |
|---|---|---|
| 0 | Load thesis + rules from `qualification.md` into Neon; create the HubSpot "Accelerator Outreach" pipeline | `scripts/setup.ts` |
| 1 | A founder announces a seed round | outside world |
| 2 | Pull news: RSS + GNews + NewsData.io + investor-portfolio diffs, deduped by URL/title hash | `/api/cron/ingest` → `lib/pipeline/ingest.ts` |
| 3 | Gemini Flash reads each article → structured facts + evidence quotes (`null` when unknown) | `/api/cron/extract` → `lib/pipeline/extract.ts` |
| 4 | Code gates G1–G5 against `qualification_config` → reject/skip with reason codes, `qualification_log` | `/api/cron/qualify` → `lib/qualification/gates.ts` |
| 5 | Jina (website) + Tavily (domain, founder LinkedIn, posts/quotes, size band) | `/api/cron/enrich` → `lib/pipeline/enrich.ts` |
| 6 | Gemini scores 5 thesis factors; code weights them with the live thesis; ≥ threshold → draft + 3 follow-ups, validated in code (≤ 2 rewrites) | `/api/cron/score-draft` → `lib/pipeline/score-draft.ts` |
| 7 | Save to Neon; upsert Company + Contact + Deal in HubSpot at **Draft ready** | same route → `lib/hubspot.ts` |
| 8 | Resend emails Rohit the morning summary | `/api/cron/summary` → `lib/pipeline/summary.ts` |
| 9 | **Human gate**: approve / edit / skip in the Outreach editor | `app/(app)/outreach/[id]` → `lib/outreach.ts` |
| 10 | Resend sends; webhook marks delivered/bounced; HubSpot → **Email sent**; day 3/7/14 follow-ups unless the deal is at Replied or later | `/api/resend/webhook`, `/api/cron/followups` |

Crons (`vercel.json`, UTC): ingest 00:30 · extract 00:40 · qualify 00:50 · enrich 01:00 · score-draft 01:10 (= 6:00–6:40 IST) · summary 01:20 · follow-ups 04:30. Every stage reads pending rows from Neon, works in batches, is idempotent, and checks `Authorization: Bearer $CRON_SECRET`. **Run pipeline now** (top bar) runs steps 2–7 in one request.

## Stack

Next.js 15 (App Router, server actions) · Tailwind v4 · shadcn/ui · lucide-react · Recharts · Neon + Drizzle (migrations in `drizzle/`) · Gemini Flash via `@google/genai` (`responseSchema` + Zod) · Jina Reader · Tavily · Resend · `@hubspot/api-client` · Vercel Cron · Vitest.

## Components map

| Area | Files |
|---|---|
| **Pages** | `app/(app)/page.tsx` Home · `pipeline/` flow canvas · `outreach/` table + `[id]` editor · `leads/` list + `[id]` profile · `thesis/` rules builder · `analytics/` · `settings/` |
| Public pages | `app/unsubscribe/[token]` (no app shell), `app/api/unsubscribe/[token]` (one-click) |
| App shell | `app/(app)/layout.tsx`, `components/shell/*` (sidebar with pending-draft badge, top bar with search, Run pipeline, DEMO pill) |
| Shared UI | `components/signal/*` (status pill, KPI card + sparkline, fit bar, empty/error/skeleton states, section card) |
| Feature UI | `components/pipeline/flow.tsx` · `components/outreach/{outreach-table,editor}.tsx` · `components/leads/*` · `components/thesis/*` · `components/analytics/charts.tsx` · `components/settings/controls.tsx` |
| Database | `db/schema.ts`, `db/index.ts`, `drizzle/*.sql`, `drizzle.config.ts` |
| Config (fresh every run) | `lib/config.ts` |
| Rules parser | `lib/qualification/parse-md.ts` |
| Facts + gates (pure, tested) | `lib/qualification/facts.ts`, `lib/qualification/gates.ts` |
| Pipeline stages | `lib/pipeline/{ingest,extract,qualify,enrich,score-draft,summary,followups}.ts`, registry `stages.ts`, run records `runs.ts` |
| Ingest sources | `lib/ingest/{rss,news-apis,portfolio}.ts` |
| Research | `lib/research/{tavily,match}.ts`, `lib/http.ts` (Jina) |
| Gemini prompts | `lib/prompts/{extract,score,draft,opener}.ts`, client `lib/gemini.ts` |
| Email rules (code) | `lib/validateEmail.ts` |
| Human gate + sending | `lib/outreach.ts`, `lib/email/send.ts` (DEMO redirect), `lib/email/webhook.ts` (Svix signature) |
| CRM | `lib/hubspot.ts` |
| Thesis preview | `lib/thesis-preview.ts` |
| Demo | `lib/demo.ts`, `lib/pipeline/demo-seed.ts`, `lib/pipeline/demo-reset.ts`, `scripts/seed-demo.ts` |
| Scripts | `scripts/{setup,migrate,seed-demo,run-stage,redraft,rematch-linkedin,sync-hubspot}.ts` |
| Tests | `tests/qualification.test.ts`, `tests/email.test.ts` |

## Setup

```bash
git clone https://github.com/shrikardmahajankatti-droid/signal-outreach && cd signal-outreach
npm install
cp .env.example .env.local     # fill in every key (see below)
npm run db:migrate             # apply drizzle/*.sql to Neon
npm run setup                  # thesis + rules from qualification.md, email rules, sources, investors, HubSpot pipeline
npm run seed:demo              # load demo_startups.json and run it through the real pipeline (steps 3–7)
npm run dev
```

Keys: Neon `DATABASE_URL`; Gemini (AI Studio) `GEMINI_API_KEY` + `GEMINI_MODEL`; `TAVILY_API_KEY`; `GNEWS_API_KEY`; `NEWSDATA_API_KEY`; Resend `RESEND_API_KEY` (sending access is enough), `OUTREACH_FROM` on a verified domain, `RESEND_WEBHOOK_SECRET` (from a webhook pointing at `<APP_URL>/api/resend/webhook` with delivered/bounced/complained/opened events); HubSpot `HUBSPOT_ACCESS_TOKEN` (service key or private app with `crm.objects.{companies,contacts,deals}.{read,write}` + `crm.schemas.deals.{read,write}`); `ROHIT_EMAIL`, `TEST_INBOX`, `CRON_SECRET` (any long random string), `APP_URL`, `DEMO_MODE=true`.

Secrets live only in `.env.local` (git-ignored) and Vercel env vars. On Vercel set the same variables for Production; crons come from `vercel.json`.

Useful commands:

```bash
npm run stage -- ingest        # run one stage (or "extract,qualify", or "all")
npm test                       # 49 unit tests: gates, §10 cases, Zomint merge, email rules, scoring, matching
npm run test:db                # + checks the demo decisions the real pipeline wrote to Neon
npm run redraft -- all         # regenerate pending drafts after changing prompts/profile
npm run setup -- --force       # reload thesis/config/email rules from the files (overwrites UI edits)
```

## 3-minute demo script

1. **Home (0:00).** "Good morning, Rohit." KPI cards: drafts ready, sent this week, reply rate, hours from announcement to email. Today's run funnel and recent activity.
2. **Run pipeline now (0:20).** Click it in the top bar. It pulls live RSS/GNews/NewsData plus investor-portfolio diffs, extracts with Gemini, applies the code gates, researches, scores and drafts. The status line shows what each stage did.
3. **Pipeline (0:45).** Ten nodes, trigger to send; the human gate is amber. Click **Hard gates G1–G5**: see e.g. DailyObjects rejected `REJ_LATE_STAGE`, `REJ_ROUND_TOO_BIG`; Healthleap `REJ_ROUND_TOO_BIG`; NeoGrowth `REJ_EXCLUDED_SECTOR`.
4. **Outreach (1:05).** Drafts sorted by fit, with days left in the 30-day window. Open **Desible.ai**: the opener quotes Uttam's "voice AI is the entry point" line, followed by one challenge, one way we help, and one yes/no ask. The checklist shows 11/11. Type "!" in the subject and the checklist goes red and Approve disables. Undo it.
5. **Approve & send (1:35).** The To field shows "email needed". In DEMO MODE it goes to the test inbox with a `[DEMO → would go to: Uttam Tiwari …]` banner. Show the email arriving; the row moves to **Sent**; the HubSpot deal moves to **Email sent** with the email on its timeline. Day 3/7/14 follow-ups are now scheduled.
6. **Leads → Desible.ai profile (2:00).** Fit ring, properties with evidence tooltips, founders with **Verify on LinkedIn** and match confidence, timeline from article found to sent. 👍 feedback feeds future scoring. **Show rejected** reveals the hidden rejects with reason codes.
7. **Thesis & Rules (2:25).** Raise the fit threshold to 85: the preview drops from "would draft 10" to 2. Drag the sector weight. Save → "Applies from the next run". No deploy needed.
8. **Analytics + Settings (2:45).** Funnel, rejection reasons, reply rate by opener. Settings: integrations all green, DEMO MODE (locked on unless `ALLOW_LIVE_SEND=true`), sources and investors, accelerator profile, **Reset demo**, **Send morning summary now**.

## Definition of done

- [x] Public Vercel URL; "Run pipeline now" processes **live** news end to end
- [x] Demo startups produce the expected decisions (Desible 90, CurvetAI 91, Credfix 74, Zomint 73 accepted; CureMeAbroad maybe; Zinara, The Dough Therapy `REJ_LOW_FIT`; DailyObjects, StockGro, Lumio, NeoGrowth, Healthleap hard-gate rejects); tests pass
- [x] Thesis edits change the next run's scores with no deploy (weights applied in code from Neon; live preview)
- [x] Never drafted/emailed twice: unique root domain, normalised-name fallback, one draft per startup, `contacted` + `do_not_contact` checked before drafting and again at send
- [x] Approve → email in TEST_INBOX → HubSpot deal to Email sent (+ timeline note)
- [x] No keys in the repo; `.env.example` complete
- [x] README: components map, setup, demo script

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
- **GNews free plan.** Articles arrive with a 12-hour delay, and parallel requests return 429, so GNews queries run 3 s apart. A hyphenated term must be quoted (`"pre-seed"`).
- **Missing API keys.** A source whose key isn't set (GNews, NewsData) is counted as `sources_skipped`, not as a failure.
- **Cron route shape.** One dynamic route, `app/api/cron/[stage]`, serves `/api/cron/ingest`, `/api/cron/extract`, and so on. Each checks `Authorization: Bearer $CRON_SECRET`. "Run pipeline now" calls the stages in-process, so the secret never reaches the browser.
- **Model.** `GEMINI_MODEL=gemini-3.8-flash`, the newest Flash model on the account. The code default is the same if the env var is empty.
- **Extraction fields.** The output contains every field from `qualification.md` §8. Amounts are extracted in their stated currency and converted to USD in code, using `inr_per_usd` and `fx_per_usd` from config. A few extra facts are extracted so the gates can stay in code: `instrument`, `raiser_type`, `is_exit_event`, `is_traditional_sme`, `serial_founder_with_exit`, `excluded_sector_match` and `founder_quotes`. Gemini never outputs accept or reject.
- **Excluded sectors.** The live excluded-sector list from the `thesis` row is passed into the extraction prompt. Gemini names the matching list item, and the code rejects only if that item is still on the live list.
- **Multi-company articles.** A roundup that covers several rounds yields one announcement per company. Each company is merged into its startup row, matched by root domain, then normalised name, then the same first word with the same round amount (±5%, within 7 days).
- **Mixed equity + debt rounds** are rejected as `REJ_NON_EQUITY`, because acceptance criterion 1 requires an equity or convertible round. This is configurable through `reject_mixed_debt_rounds`.
- **"Name + (domain or founder)".** If neither a domain nor a founder is known after extraction, the startup is flagged `identity_to_enrich`, and `REJ_UNIDENTIFIABLE` is applied only if research can't find one. Generic names such as "a stealth startup" are rejected immediately.
- **Demo clock.** Demo-only startups are gated against a fixed date: the day after the latest demo announcement, stored as `app_settings.demo_reference_date`. This keeps their recency decisions stable whenever the demo is replayed. All demo companies are also in live news (the Inc42 roundup was ingested from RSS), so most become live leads and use the real clock.
- **Time budget.** The extract stage stops starting new Gemini batches after 200 s. Leftover articles stay `new` and are picked up by the next run.
- **Research budget.** Each startup uses at most 3 Tavily credits: a domain search (only when the domain is unknown), a LinkedIn search that returns founder profiles and the company-size band, and a posts/interviews search. It also uses one Jina read of the homepage. Research results are stored in `startups.research`, so matching can be re-run without new searches (`scripts/rematch-linkedin.ts`).
- **LinkedIn confidence** is computed in code (`lib/research/match.ts`) and is never set by the model. A profile must carry the founder's name: a full name match adds 0.5, the company name adds 0.35, and a founder/CEO title adds 0.15. "Verify on LinkedIn" in the UI lets Rohit confirm a match.
- **Fit score.** Gemini scores each of the 5 thesis factors from 0 to 100. The weighted total is computed in code from the live `thesis.weights`, followed by the §4b adjustments (`penalty_*`, `bonus_serial_founder`). Changing a weight therefore changes the next run's scores with no deploy. Thresholds come from the `thesis` row (≥ 70 drafts, 50–69 maybe, < 50 `REJ_LOW_FIT`). The last 10 👍/👎 feedback rows are passed in as calibration examples.
- **Maybe list.** Startups scored 50–69 are kept as `maybe` without a draft, to save tokens. Rohit can draft one from the Leads page.
- **Drafts and the validator.** Gemini writes the body without a sign-off, and the code appends the standard footer, which includes a signed unsubscribe link. The footer doesn't count towards the 150-word limit. `lib/validateEmail.ts` checks: subject < 50 characters and names the company, body < 150 words, a specific first line (it mentions a founder, investor, number, quote, or shares 3 or more words with the opener fact), exactly one question, no exclamation marks, no banned phrases or spam words (whole-word matching), plain text, no placeholders, and the unsubscribe footer. On failure, Gemini rewrites with the list of failed checks, at most twice. Every attempt is stored in `drafts.checks.history`.
- **No invented emails.** `drafts.to_email` is filled only from a known founder email, so for news-sourced leads it starts empty and Rohit types it in.
- **Shared deadline.** "Run pipeline now" runs ingest → extract → qualify → enrich → score-draft in one request, with a 250 s shared deadline (Vercel limit: 300 s). Stages stop starting new work at the deadline, and the UI says how many items are left for the next run.
- **HubSpot service key.** This HubSpot account no longer offers private apps, so a scoped **service key** (same bearer-token API) is used. It has no email-engagement scope, so sent emails are logged on the deal timeline as **notes** (subject + body). The deal carries `signal_round`, `signal_investors`, `signal_fit_score` and `signal_app_link` properties, which `npm run setup` creates.
- **Replies.** Replies go to `ROHIT_EMAIL` via reply-to. Signal doesn't read his inbox, so Rohit marks **Replied / Meeting booked / Applied / Not pursued** on the lead profile, or moves the deal in HubSpot. The follow-up cron reads the HubSpot deal stage before every send and stops at Replied or later.
- **Contacted** is recorded at send time and confirmed by the `email.delivered` webhook, so a startup can't be emailed twice even before the webhook arrives. Bounces and complaints add the domain/email to `do_not_contact` and cancel follow-ups.
- **Unsubscribe.** Every email ends with the footer and a signed link (`/unsubscribe/<id>.<hmac>`) plus `List-Unsubscribe` / one-click headers. Unsubscribing → `do_not_contact`, follow-ups cancelled, deal → Not pursued.
- **Live sends are locked.** `DEMO_MODE=true` redirects everything to `TEST_INBOX`. The Settings toggle can only turn demo mode off when `ALLOW_LIVE_SEND=true` is set in Vercel, so the public URL can never email real founders by accident. The app has no login; add Vercel password protection or an auth layer before using it with live sends.
- **Merges can't bypass a gate.** A later article can fill missing facts, but it can't introduce an excluded-sector match after the gates have run.
- **Vercel Hobby crons** run once a day and may fire anywhere within the scheduled hour, which is why each stage is its own cron and every stage is idempotent.

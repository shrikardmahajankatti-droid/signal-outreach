# Qualification Rules: Funding Outreach Engine

This file decides which funding news becomes a draft email for Rohit, and which gets rejected silently.

**Golden rule:** Rohit should only see startups that are early-stage, recently funded, and a fit for the thesis. When in doubt about *fit*, score low. When in doubt about *facts* (e.g. employee count unknown), don't reject. Flag it instead.

> Every number below is a **default**. The live values live in the Neon `qualification_config` table (see section 7). Change them there; no code changes needed.

---

## 1. Pipeline order (cheapest checks first)

| Gate | Question | Checked by | On fail |
|---|---|---|---|
| **G1 – Is it a funding announcement?** | Does the article report a company raising money? | Gemini extraction | Drop article |
| **G2 – Is it the right round?** | Pre-seed / seed / angel? | Gemini + code | Reject |
| **G3 – Is it recent?** | Announced inside the outreach window? | Code | Reject |
| **G4 – Is it a startup, not a mature company?** | Size, age, funding history, ownership | Enrichment + code | Reject |
| **G5 – Already handled?** | Contacted / drafted / rejected before? | Neon lookup | Skip |
| **G6 – Thesis fit** | Sector, geography, model, team | Gemini scoring vs `thesis` table | Reject below threshold |

Gates **G1–G5 are hard rules enforced in code** (Gemini only extracts the facts). Only G6 is a judgement score. That way the LLM can't "talk itself into" a 2,000-person company.

---

## 2. Acceptance criteria (ALL must be true)

A startup reaches Rohit's drafts only if:

1. **It is a new equity or convertible funding round**: priced equity, SAFE, convertible note, or iSAFE.
2. **Round stage is one of:** `pre-seed`, `seed`, `angel`, `seed extension`, `pre-Series A` *(pre-Series A → accepted but flagged "check stage")*.
3. **Round size ≤ $6M USD** (≈ ₹50 Cr). Rounds of $6–10M labelled "seed" are flagged, not auto-accepted.
4. **Announcement date is within the outreach window:**
   - Normal run: announced in the **last 24–48 hours**.
   - Late catch (we missed it earlier): announced **≤ 30 days** ago → still accepted, marked `late_catch`.
5. **Company is early-stage** (all of section 4 passes).
6. **Not previously contacted, drafted, or rejected** (by company domain).
7. **Thesis fit score ≥ 70 / 100** (threshold configurable).
8. **We can identify the company**: at least a company name **and** (website domain **or** a founder name).

---

## 3. Rejection criteria: news / round level

| Code | Reject when… | Example |
|---|---|---|
| `REJ_NOT_FUNDING` | Article isn't about raising money (product launch, hiring, award, opinion piece, funding *roundup* with no detail) | "Top 10 startups to watch" |
| `REJ_LATE_STAGE` | Series A or later (A, B, C…, growth, late-stage, pre-IPO) | "Raises $15M Series A" |
| `REJ_ROUND_TOO_BIG` | Round > $10M USD, whatever it's called | "$12M seed round" |
| `REJ_NON_EQUITY` | Debt-only, venture debt, bank loan, revenue-based financing, government grant only, prize money | "Secures ₹20 Cr venture debt" |
| `REJ_EXIT_EVENT` | IPO, acquisition, merger, SPAC, buyback, secondary sale | "Acquired by Zomato" |
| `REJ_CROWDFUNDING` | Equity/reward crowdfunding only (Kickstarter, Wefunder) *(configurable)* | — |
| `REJ_TOO_OLD_NEWS` | Round announced > 30 days ago (article is a re-report or recap) | Recap of a March round in a June article |
| `REJ_FUND_NOT_STARTUP` | The money is raised *by* a VC fund, accelerator, or incubator, not a startup | "XYZ Ventures closes $50M Fund II" |
| `REJ_UNIDENTIFIABLE` | Can't determine company name + website or founder | "A stealth Bengaluru startup raised…" |

---

## 4. Rejection criteria: mature / non-startup companies

This is the "**no companies > 500 employees, no mature companies**" rule. **Any one** hard signal → reject.

### 4a. Hard rejects

| Code | Signal | Default threshold |
|---|---|---|
| `REJ_TOO_MANY_EMPLOYEES` | Employee count | **> 500** |
| `REJ_TOO_OLD` | Company age (founding year → today) | **> 8 years** |
| `REJ_RAISED_TOO_MUCH` | Total funding raised to date (all rounds) | **> $15M USD** |
| `REJ_HAS_SERIES_A` | Has already raised a Series A or later in the past | Any |
| `REJ_PUBLIC` | Publicly listed (NSE/BSE/NASDAQ/NYSE etc.) | Any |
| `REJ_SUBSIDIARY` | Subsidiary, spin-off, JV, or division of a large/listed company or conglomerate | Any |
| `REJ_ACQUIRED` | Already acquired or majority-owned by another company | Any |
| `REJ_HIGH_REVENUE` | Reported annual revenue | **> $10M USD** (≈ ₹85 Cr) |
| `REJ_TRADITIONAL_SME` | Established non-tech business (manufacturer, trader, distributor, franchise, agency) raising its first outside money after years of operating | Gemini judgement + age |

### 4b. Soft signals (don't reject, lower the score and flag)

| Signal | Effect |
|---|---|
| 51–500 employees | −15 fit points, flag `large_team` (seed startups are usually < 50) |
| 5–8 years old | −10 fit points, flag `older_company` |
| Previously raised a seed round (this is a 2nd/3rd seed) | −5, flag `multiple_seed` |
| Serial founder with a prior exit | **+5** (good signal, not a penalty) |

### 4c. When the data is missing

Early startups often have no public headcount. **Missing data is not a reason to reject.**

1. Try in this order: funding article → company website (About / Careers page) → LinkedIn company-size band from search snippet (e.g. "11–50 employees") → Crunchbase/Tracxn snippet in search results.
2. If still unknown, use proxies: round size (≤ $3M → almost surely small) and founding year.
3. Still unknown → **accept** with flag `size_unverified`, shown as a small badge on the draft so Rohit can check in 5 seconds.

---

## 5. Duplicate / already-handled rules (G5)

| Code | Rule |
|---|---|
| `SKIP_ALREADY_CONTACTED` | Company domain exists in `contacted`. Never draft again, even for a new round. *(Exception: Rohit manually re-opens it.)* |
| `SKIP_DRAFT_EXISTS` | A pending draft already exists for this domain. Attach the new article as an extra source instead. |
| `SKIP_PREVIOUSLY_REJECTED` | Rejected in the last 90 days. Re-evaluate only if the new news changes a hard fact (e.g. a new round). |
| `SKIP_DO_NOT_CONTACT` | Domain or founder email is on the `do_not_contact` list (unsubscribed, asked not to be contacted, portfolio company, competitor). |

**Matching key:** the company's root domain (e.g. `acme.ai`). If there's no domain, fall back to normalised company name + founder name.

---

## 6. Thesis fit scoring (G6)

Read **fresh from the Neon `thesis` table on every run**. Gemini returns a 0–100 score with reasons.

| Factor | Weight | Default thesis (edit in Neon) |
|---|---|---|
| Sector match | 35 | B2B SaaS, AI/ML, fintech infra, dev tools, climate tech, health tech |
| Geography match | 20 | India (primary), SEA, global-from-India |
| Business model | 15 | Tech-enabled, scalable; not pure services/agency |
| Team signal | 15 | Technical co-founder, domain experience, prior startup experience |
| Timing / need | 15 | Fresh capital + likely needs GTM, hiring, or fundraising support |

**Excluded sectors (auto-reject `REJ_EXCLUDED_SECTOR`, configurable):** gambling/betting, tobacco/alcohol, weapons, adult content, crypto token sales, MLM, pure real estate, lending-only NBFCs.

**Threshold:** score ≥ **70** → draft. 50–69 → `maybe` list (hidden by default, viewable via a toggle). < 50 → reject `REJ_LOW_FIT`.

---

## 7. Config table (so nothing is hard-coded)

`qualification_config`: one row per setting:

| key | default | meaning |
|---|---|---|
| `max_employees` | 500 | Hard reject above this |
| `soft_employee_flag` | 50 | Penalise above this |
| `max_company_age_years` | 8 | Hard reject above this |
| `max_round_usd` | 6000000 | Auto-accept ceiling |
| `hard_max_round_usd` | 10000000 | Reject above this |
| `max_total_raised_usd` | 15000000 | Reject above this |
| `max_revenue_usd` | 10000000 | Reject above this |
| `allowed_stages` | `["pre-seed","seed","angel","seed extension","pre-series a"]` | Accepted round labels |
| `fresh_window_hours` | 48 | Normal acceptance window |
| `late_catch_days` | 30 | Max age for late catches |
| `fit_threshold` | 70 | Minimum score to draft |
| `maybe_threshold` | 50 | Minimum to appear in "maybe" |
| `allow_crowdfunding` | false | — |
| `rejected_recheck_days` | 90 | Cool-off before re-evaluating |

Currency: convert INR/EUR/etc. to USD with a fixed rate stored in config (e.g. `inr_per_usd = 85`) so the rules work without a paid FX API.

---

## 8. What Gemini must return (extraction schema)

```json
{
  "is_funding_announcement": true,
  "company_name": "Acme AI",
  "company_domain": "acme.ai",
  "round_stage": "seed",
  "round_amount_usd": 2500000,
  "announced_date": "2026-10-11",
  "investors": ["Blume Ventures", "Angel: Kunal Shah"],
  "founders": [{"name": "Priya Rao", "title": "CEO"}],
  "employee_count": null,
  "employee_count_source": "unknown",
  "founded_year": 2024,
  "total_raised_usd": 3000000,
  "prior_rounds": ["pre-seed"],
  "is_public": false,
  "parent_company": null,
  "is_acquired": false,
  "revenue_usd": null,
  "sector": "B2B SaaS / AI",
  "hq_country": "India",
  "evidence": {"round_stage": "quote from article…", "employee_count": null}
}
```

Rules for the prompt: **use `null` when a fact isn't stated, never guess.** Every non-null fact needs an `evidence` quote. Code applies the gates; Gemini never outputs accept/reject for G1–G5.

---

## 9. Logging every decision

Every evaluated company gets a row in `qualification_log`: `company_domain`, `decision` (`accepted` / `maybe` / `rejected` / `skipped`), `reason_codes[]`, `fit_score`, `flags[]`, `source_urls[]`, `config_snapshot`, `run_id`.

Rohit never sees rejects, but this log powers the run report ("62 articles → 14 funding news → 9 rejected → 5 drafts") and lets you debug why something was dropped.

---

## 10. Test cases (use these to check the pipeline)

| # | News | Expected |
|---|---|---|
| 1 | 2-yr-old Bengaluru AI startup, 12 people, raises $1.5M seed from Blume, yesterday | ✅ Accept |
| 2 | Fintech raises $3M pre-seed, headcount unknown, founded 2025 | ✅ Accept, flag `size_unverified` |
| 3 | 15-yr-old textile manufacturer raises ₹30 Cr from PE fund | ❌ `REJ_TOO_OLD`, `REJ_TRADITIONAL_SME` |
| 4 | 800-person company raises "seed" for a new product line | ❌ `REJ_TOO_MANY_EMPLOYEES` |
| 5 | Tata-backed spin-off raises $4M | ❌ `REJ_SUBSIDIARY` |
| 6 | Startup raises $20M Series A | ❌ `REJ_LATE_STAGE`, `REJ_ROUND_TOO_BIG` |
| 7 | Startup raises ₹10 Cr venture debt | ❌ `REJ_NON_EQUITY` |
| 8 | Seed round announced 45 days ago, appearing in a recap | ❌ `REJ_TOO_OLD_NEWS` |
| 9 | Same startup as #1 appears in 4 more articles today | ⏭ `SKIP_DRAFT_EXISTS` (sources merged) |
| 10 | Seed-stage online betting app | ❌ `REJ_EXCLUDED_SECTOR` |
| 11 | "XYZ Capital closes ₹200 Cr Fund III" | ❌ `REJ_FUND_NOT_STARTUP` |
| 12 | 120-person, 6-yr-old SaaS raises $5M "pre-Series A", fit 78 | ✅ Accept, flags `large_team`, `older_company`, `check stage` |

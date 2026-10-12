// Step 0: one-time setup. Loads the thesis and rules from qualification.md into Neon,
// seeds email rules, app settings, news sources and investor portfolio pages.
//
//   npm run setup            insert anything missing, keep edits made in the UI
//   npm run setup -- --force overwrite config, thesis and email rules from the files
import "./load-env"
import { readFileSync } from "node:fs"
import { eq, sql } from "drizzle-orm"
import { getDb, schema } from "../db"
import { parseQualificationMd } from "../lib/qualification/parse-md"
import { ensureDealProperties, ensurePipeline, fetchAccount } from "../lib/hubspot"

const force = process.argv.includes("--force")

// Keys the pipeline needs that qualification.md describes in prose (sections 4b/4c)
// rather than in the section 7 table. Stored alongside so nothing is hard-coded.
const EXTRA_CONFIG: { key: string; value: unknown; description: string }[] = [
  { key: "soft_age_years", value: 5, description: "Flag older_company at or above this age (section 4b)" },
  { key: "penalty_large_team", value: 15, description: "Fit points removed for large_team (section 4b)" },
  { key: "penalty_older_company", value: 10, description: "Fit points removed for older_company (section 4b)" },
  { key: "penalty_multiple_seed", value: 5, description: "Fit points removed for multiple_seed (section 4b)" },
  { key: "bonus_serial_founder", value: 5, description: "Fit points added for a serial founder with an exit (section 4b)" },
  { key: "small_round_proxy_usd", value: 3000000, description: "Round size at or below which team size is assumed small (section 4c)" },
  { key: "flag_stages", value: ["pre-series a"], description: "Accepted stages that get the check_stage flag" },
  {
    key: "reject_mixed_debt_rounds",
    value: true,
    description: "Reject rounds that mix equity and debt (acceptance criterion 1 requires an equity/convertible round)",
  },
  {
    key: "fx_per_usd",
    value: { INR: 85, EUR: 0.92, GBP: 0.79, SGD: 1.35, AED: 3.67 },
    description: "Fixed FX rates (units per USD); INR mirrors inr_per_usd",
  },
]

const EMAIL_RULES = {
  subjectMaxChars: 50,
  bodyMaxWords: 150,
  bannedPhrases: [
    "hope this finds you well",
    "hope this email finds you well",
    "hope you are doing well",
    "hope you're doing well",
    "i hope you're well",
    "just checking in",
    "touching base",
    "circle back",
    "per my last email",
    "i wanted to reach out",
    "quick question",
    "synergy",
  ],
  spamWords: [
    "free",
    "guarantee",
    "guaranteed",
    "act now",
    "urgent",
    "limited time",
    "risk-free",
    "no obligation",
    "click here",
    "winner",
    "congratulations",
    "cash",
    "earn money",
    "special offer",
    "exclusive deal",
    "100%",
    "amazing",
    "incredible",
    "once in a lifetime",
    "don't miss",
  ],
  footer: "—\nRohit\n{{accelerator_name}}\n\nNot the right time? Reply \"unsubscribe\" or use {{unsubscribe_url}} and I won't email again.",
}

// demo_mode_override / test_inbox_override are written from Settings; absent means "use the env var".
const APP_SETTINGS: Record<string, unknown> = {
  accelerator_profile: {
    name: "Launchpad Accelerator",
    one_liner: "A 12-week early-stage accelerator for Indian founders building tech-first companies.",
    offers: [
      "Hands-on GTM and first-hires support",
      "Investor readiness for the next round",
      "A peer group of founders at the same stage",
      "Mentors with domain experience in AI, fintech and B2B SaaS",
    ],
    sender_name: "Rohit",
    application_url: "",
  },
}

const SOURCES = [
  { name: "Inc42 Buzz", type: "rss", url: "https://inc42.com/buzz/feed/" },
  { name: "Entrackr", type: "rss", url: "https://entrackr.com/rss" },
  { name: "YourStory", type: "rss", url: "https://yourstory.com/feed" },
  { name: "StartupTalky", type: "rss", url: "https://startuptalky.com/rss/" },
  { name: "TechCrunch Venture", type: "rss", url: "https://techcrunch.com/category/venture/feed/" },
  { name: "e27", type: "rss", url: "https://e27.co/index_wp.php/feed/" },
  {
    name: "Google News: seed rounds (India)",
    type: "rss",
    url: "https://news.google.com/rss/search?q=startup+raises+(%22seed+round%22+OR+%22pre-seed%22)+when:2d&hl=en-IN&gl=IN&ceid=IN:en",
  },
  {
    name: "Google News: raises seed (India)",
    type: "rss",
    url: "https://news.google.com/rss/search?q=%22raises%22+%22seed%22+startup+India+when:2d&hl=en-IN&gl=IN&ceid=IN:en",
  },
  { name: "GNews: seed rounds", type: "gnews", url: "startup raises seed round" },
  { name: "GNews: pre-seed", type: "gnews", url: 'startup raises "pre-seed"' },
  { name: "NewsData: seed funding India", type: "newsdata", url: "seed funding startup" },
]

const INVESTORS = [
  { name: "Blume Ventures", portfolioUrl: "https://blume.vc/companies" },
  { name: "Prime Venture Partners", portfolioUrl: "https://www.primevp.in/portfolio" },
  { name: "Antler India", portfolioUrl: "https://www.antler.co/portfolio" },
  { name: "Inflection Point Ventures", portfolioUrl: "https://ipventures.in/portfolio" },
]

async function main() {
  const db = getDb()
  const md = readFileSync("qualification.md", "utf8")
  const parsed = parseQualificationMd(md)

  // qualification_config
  const configRows = [...parsed.config, ...EXTRA_CONFIG]
  for (const row of configRows) {
    const insert = db.insert(schema.qualificationConfig).values(row)
    await (force
      ? insert.onConflictDoUpdate({
          target: schema.qualificationConfig.key,
          set: { value: row.value, description: row.description },
        })
      : insert.onConflictDoNothing())
  }
  console.log(`qualification_config: ${configRows.length} keys ${force ? "written" : "ensured"}`)

  // thesis (single active row); thresholds come from the config table.
  const fit = parsed.config.find((r) => r.key === "fit_threshold")?.value as number
  const maybe = parsed.config.find((r) => r.key === "maybe_threshold")?.value as number
  const [active] = await db.select({ id: schema.thesis.id }).from(schema.thesis).where(eq(schema.thesis.active, true))
  if (!active || force) {
    if (active) await db.update(schema.thesis).set({ active: false }).where(eq(schema.thesis.id, active.id))
    await db.insert(schema.thesis).values({ ...parsed.thesis, fitThreshold: fit, maybeThreshold: maybe, active: true })
    console.log("thesis: active row written")
  } else {
    console.log("thesis: active row already present (use --force to reload)")
  }

  // email_rules (single row)
  const [rules] = await db.select({ id: schema.emailRules.id }).from(schema.emailRules).limit(1)
  if (!rules) {
    await db.insert(schema.emailRules).values(EMAIL_RULES)
    console.log("email_rules: written")
  } else if (force) {
    await db.update(schema.emailRules).set(EMAIL_RULES).where(eq(schema.emailRules.id, rules.id))
    console.log("email_rules: overwritten")
  } else {
    console.log("email_rules: already present")
  }

  for (const [key, value] of Object.entries(APP_SETTINGS)) {
    await db.insert(schema.appSettings).values({ key, value }).onConflictDoNothing()
  }
  await db.insert(schema.sources).values(SOURCES).onConflictDoNothing()
  await db.insert(schema.investors).values(INVESTORS).onConflictDoNothing()

  const [{ n: sourceCount }] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.sources)
  const [{ n: investorCount }] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.investors)
  console.log(`app_settings ensured · sources: ${sourceCount} · investors: ${investorCount}`)

  // HubSpot: "Accelerator Outreach" deal pipeline + Signal deal properties.
  if (!process.env.HUBSPOT_ACCESS_TOKEN) {
    console.log("hubspot: skipped (HUBSPOT_ACCESS_TOKEN not set)")
  } else {
    const [pipeline, account] = await Promise.all([ensurePipeline(), fetchAccount()])
    await ensureDealProperties()
    for (const [key, value] of [["hubspot_pipeline", pipeline], ["hubspot_account", account]] as const) {
      await db
        .insert(schema.appSettings)
        .values({ key, value })
        .onConflictDoUpdate({ target: schema.appSettings.key, set: { value } })
    }
    console.log(`hubspot: pipeline "${"Accelerator Outreach"}" ${pipeline.pipelineId} with ${Object.keys(pipeline.stages).length} stages`)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

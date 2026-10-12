import { sql } from "drizzle-orm"
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  real,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core"

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
}

// ─── Inputs ──────────────────────────────────────────────────────────────────

export const sources = pgTable("sources", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  // rss | gnews | newsdata
  type: text("type").notNull(),
  // Feed URL for rss; search query for gnews / newsdata.
  url: text("url").notNull().unique(),
  active: boolean("active").notNull().default(true),
  lastFetchedAt: timestamp("last_fetched_at", { withTimezone: true }),
  lastError: text("last_error"),
  ...timestamps,
})

export const investors = pgTable("investors", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  portfolioUrl: text("portfolio_url").notNull(),
  // { companies: string[], fetchedAt: string }
  lastSnapshot: jsonb("last_snapshot"),
  active: boolean("active").notNull().default(true),
  lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
  lastError: text("last_error"),
  ...timestamps,
})

export const articles = pgTable(
  "articles",
  {
    id: serial("id").primaryKey(),
    url: text("url").notNull(),
    urlHash: text("url_hash").notNull().unique(),
    title: text("title").notNull(),
    // Normalised-title hash: the same story syndicated under different URLs is stored once.
    titleHash: text("title_hash"),
    source: text("source").notNull(),
    sourceType: text("source_type").notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    snippet: text("snippet"),
    rawText: text("raw_text"),
    // new → extracted | not_funding | error
    status: text("status").notNull().default("new"),
    extraction: jsonb("extraction"),
    error: text("error"),
    attempts: integer("attempts").notNull().default(0),
    isDemo: boolean("is_demo").notNull().default(false),
    ...timestamps,
  },
  (t) => [
    index("articles_status_idx").on(t.status),
    index("articles_published_idx").on(t.publishedAt),
    index("articles_title_hash_idx").on(t.titleHash),
  ]
)

// ─── Startups ────────────────────────────────────────────────────────────────

export const startups = pgTable(
  "startups",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    rootDomain: text("root_domain"),
    normalizedName: text("normalized_name").notNull(),
    facts: jsonb("facts").notNull().default({}),
    evidence: jsonb("evidence").notNull().default({}),
    research: jsonb("research"),
    fitScore: integer("fit_score"),
    fitReasons: text("fit_reasons").array().notNull().default(sql`'{}'::text[]`),
    // pending | accepted | maybe | rejected | skipped
    decision: text("decision").notNull().default("pending"),
    // Where the startup is in the pipeline: extracted → qualified → enriched → scored → drafted → synced
    stage: text("stage").notNull().default("extracted"),
    reasonCodes: text("reason_codes").array().notNull().default(sql`'{}'::text[]`),
    flags: text("flags").array().notNull().default(sql`'{}'::text[]`),
    announcedOn: date("announced_on"),
    hubspotCompanyId: text("hubspot_company_id"),
    hubspotDealId: text("hubspot_deal_id"),
    // Local mirror of the HubSpot deal stage (draft_ready … not_pursued) for the GTM board.
    dealStage: text("deal_stage"),
    isDemo: boolean("is_demo").notNull().default(false),
    lastError: text("last_error"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("startups_root_domain_uq").on(t.rootDomain),
    // Fallback dedupe key when the domain is unknown.
    uniqueIndex("startups_name_no_domain_uq").on(t.normalizedName).where(sql`${t.rootDomain} is null`),
    index("startups_normalized_name_idx").on(t.normalizedName),
    index("startups_decision_idx").on(t.decision),
    index("startups_stage_idx").on(t.stage),
  ]
)

export const startupSources = pgTable(
  "startup_sources",
  {
    startupId: integer("startup_id")
      .notNull()
      .references(() => startups.id, { onDelete: "cascade" }),
    articleId: integer("article_id")
      .notNull()
      .references(() => articles.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.startupId, t.articleId] })]
)

export const founders = pgTable(
  "founders",
  {
    id: serial("id").primaryKey(),
    startupId: integer("startup_id")
      .notNull()
      .references(() => startups.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    title: text("title"),
    email: text("email"),
    // Where the email came from: "rohit" (typed in), or the public page/search result it was found on.
    emailSource: text("email_source"),
    // Finder confidence (0–100) and deliverability verdict, e.g. Hunter "valid" / "accept_all" / "invalid".
    emailConfidence: integer("email_confidence"),
    emailStatus: text("email_status"),
    linkedinUrl: text("linkedin_url"),
    linkedinMatchConfidence: real("linkedin_match_confidence"),
    linkedinVerified: boolean("linkedin_verified").notNull().default(false),
    hubspotContactId: text("hubspot_contact_id"),
    // Public post / quote snippets found during research: [{ text, url, source }]
    posts: jsonb("posts"),
    ...timestamps,
  },
  (t) => [uniqueIndex("founders_startup_name_uq").on(t.startupId, t.name)]
)

// ─── Outreach ────────────────────────────────────────────────────────────────

export const drafts = pgTable(
  "drafts",
  {
    id: serial("id").primaryKey(),
    // One draft per startup, ever: the database enforces "never drafted twice".
    startupId: integer("startup_id")
      .notNull()
      .unique()
      .references(() => startups.id, { onDelete: "cascade" }),
    founderId: integer("founder_id").references(() => founders.id, { onDelete: "set null" }),
    toEmail: text("to_email"),
    subject: text("subject").notNull(),
    body: text("body").notNull(),
    // founder_post | founder_quote | product_detail | shared_investor
    openerSource: text("opener_source"),
    checks: jsonb("checks"),
    rewriteAttempts: integer("rewrite_attempts").notNull().default(0),
    // pending | approved | sent | skipped
    status: text("status").notNull().default("pending"),
    skipReason: text("skip_reason"),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    openedAt: timestamp("opened_at", { withTimezone: true }),
    clickedAt: timestamp("clicked_at", { withTimezone: true }),
    repliedAt: timestamp("replied_at", { withTimezone: true }),
    resendId: text("resend_id"),
    // The address Resend actually delivered to (TEST_INBOX in demo mode) vs to_email (the founder).
    deliveredTo: text("delivered_to"),
    ...timestamps,
  },
  (t) => [index("drafts_status_idx").on(t.status), index("drafts_resend_idx").on(t.resendId)]
)

export const followups = pgTable(
  "followups",
  {
    id: serial("id").primaryKey(),
    draftId: integer("draft_id")
      .notNull()
      .references(() => drafts.id, { onDelete: "cascade" }),
    dayOffset: integer("day_offset").notNull(),
    subject: text("subject").notNull(),
    body: text("body").notNull(),
    // scheduled | sent | cancelled
    status: text("status").notNull().default("scheduled"),
    dueAt: timestamp("due_at", { withTimezone: true }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    openedAt: timestamp("opened_at", { withTimezone: true }),
    clickedAt: timestamp("clicked_at", { withTimezone: true }),
    resendId: text("resend_id"),
    deliveredTo: text("delivered_to"),
    // Set when Rohit edits or regenerates it; the cron never overwrites edited follow-ups.
    editedAt: timestamp("edited_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("followups_draft_day_uq").on(t.draftId, t.dayOffset),
    index("followups_due_idx").on(t.status, t.dueAt),
  ]
)

export const contacted = pgTable(
  "contacted",
  {
    id: serial("id").primaryKey(),
    startupId: integer("startup_id").references(() => startups.id, { onDelete: "set null" }),
    rootDomain: text("root_domain"),
    normalizedName: text("normalized_name").notNull(),
    email: text("email"),
    contactedAt: timestamp("contacted_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("contacted_domain_uq").on(t.rootDomain),
    index("contacted_name_idx").on(t.normalizedName),
  ]
)

export const doNotContact = pgTable(
  "do_not_contact",
  {
    id: serial("id").primaryKey(),
    rootDomain: text("root_domain"),
    email: text("email"),
    // unsubscribed | bounced | complained | portfolio | competitor | manual
    reason: text("reason").notNull(),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("dnc_domain_idx").on(t.rootDomain), index("dnc_email_idx").on(t.email)]
)

// ─── Configuration (read fresh on every run) ─────────────────────────────────

export const thesis = pgTable(
  "thesis",
  {
    id: serial("id").primaryKey(),
    active: boolean("active").notNull().default(true),
    sectors: text("sectors").array().notNull(),
    geographies: text("geographies").array().notNull(),
    businessModels: text("business_models").array().notNull(),
    teamSignals: text("team_signals").array().notNull(),
    timingSignals: text("timing_signals").array().notNull().default(sql`'{}'::text[]`),
    excludedSectors: text("excluded_sectors").array().notNull(),
    // { sector, geography, business_model, team, timing } summing to 100
    weights: jsonb("weights").notNull(),
    fitThreshold: integer("fit_threshold").notNull(),
    maybeThreshold: integer("maybe_threshold").notNull(),
    ...timestamps,
  },
  (t) => [uniqueIndex("thesis_single_active_uq").on(t.active).where(sql`${t.active}`)]
)

export const qualificationConfig = pgTable("qualification_config", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  description: text("description"),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
})

export const emailRules = pgTable("email_rules", {
  id: serial("id").primaryKey(),
  subjectMaxChars: integer("subject_max_chars").notNull().default(50),
  bodyMaxWords: integer("body_max_words").notNull().default(150),
  bannedPhrases: text("banned_phrases").array().notNull(),
  spamWords: text("spam_words").array().notNull(),
  footer: text("footer").notNull(),
  ...timestamps,
})

// Small key/value store for app-level settings (accelerator profile, demo toggle, test inbox).
export const appSettings = pgTable("app_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
})

// ─── Logs and feedback ───────────────────────────────────────────────────────

export const qualificationLog = pgTable(
  "qualification_log",
  {
    id: serial("id").primaryKey(),
    startupId: integer("startup_id").references(() => startups.id, { onDelete: "cascade" }),
    companyDomain: text("company_domain"),
    // accepted | maybe | rejected | skipped
    decision: text("decision").notNull(),
    // gate | fit
    phase: text("phase").notNull().default("gate"),
    reasonCodes: text("reason_codes").array().notNull().default(sql`'{}'::text[]`),
    flags: text("flags").array().notNull().default(sql`'{}'::text[]`),
    fitScore: integer("fit_score"),
    sourceUrls: text("source_urls").array().notNull().default(sql`'{}'::text[]`),
    configSnapshot: jsonb("config_snapshot"),
    runId: integer("run_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("qlog_startup_idx").on(t.startupId), index("qlog_run_idx").on(t.runId)]
)

export const feedback = pgTable("feedback", {
  id: serial("id").primaryKey(),
  startupId: integer("startup_id")
    .notNull()
    .references(() => startups.id, { onDelete: "cascade" }),
  // good_fit | bad_fit
  label: text("label").notNull(),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})

export const runs = pgTable(
  "runs",
  {
    id: serial("id").primaryKey(),
    // ingest | extract | qualify | enrich | score-draft | summary | followups
    stage: text("stage").notNull(),
    // cron | manual | demo
    trigger: text("trigger").notNull().default("cron"),
    // running | ok | partial | error
    status: text("status").notNull().default("running"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    counts: jsonb("counts"),
    errors: jsonb("errors"),
  },
  (t) => [index("runs_stage_started_idx").on(t.stage, t.startedAt)]
)

// Timeline for each startup (article found → qualified → … → opened) and the Home activity feed.
export const events = pgTable(
  "events",
  {
    id: serial("id").primaryKey(),
    startupId: integer("startup_id").references(() => startups.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    detail: jsonb("detail"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("events_startup_idx").on(t.startupId), index("events_created_idx").on(t.createdAt)]
)

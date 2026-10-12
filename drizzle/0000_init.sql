CREATE TABLE "app_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "articles" (
	"id" serial PRIMARY KEY NOT NULL,
	"url" text NOT NULL,
	"url_hash" text NOT NULL,
	"title" text NOT NULL,
	"source" text NOT NULL,
	"source_type" text NOT NULL,
	"published_at" timestamp with time zone,
	"snippet" text,
	"raw_text" text,
	"status" text DEFAULT 'new' NOT NULL,
	"extraction" jsonb,
	"error" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "articles_url_hash_unique" UNIQUE("url_hash")
);
--> statement-breakpoint
CREATE TABLE "contacted" (
	"id" serial PRIMARY KEY NOT NULL,
	"startup_id" integer,
	"root_domain" text,
	"normalized_name" text NOT NULL,
	"email" text,
	"contacted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "do_not_contact" (
	"id" serial PRIMARY KEY NOT NULL,
	"root_domain" text,
	"email" text,
	"reason" text NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "drafts" (
	"id" serial PRIMARY KEY NOT NULL,
	"startup_id" integer NOT NULL,
	"founder_id" integer,
	"to_email" text,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"opener_source" text,
	"checks" jsonb,
	"rewrite_attempts" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"skip_reason" text,
	"approved_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"opened_at" timestamp with time zone,
	"replied_at" timestamp with time zone,
	"resend_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "drafts_startup_id_unique" UNIQUE("startup_id")
);
--> statement-breakpoint
CREATE TABLE "email_rules" (
	"id" serial PRIMARY KEY NOT NULL,
	"subject_max_chars" integer DEFAULT 50 NOT NULL,
	"body_max_words" integer DEFAULT 150 NOT NULL,
	"banned_phrases" text[] NOT NULL,
	"spam_words" text[] NOT NULL,
	"footer" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" serial PRIMARY KEY NOT NULL,
	"startup_id" integer,
	"type" text NOT NULL,
	"detail" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feedback" (
	"id" serial PRIMARY KEY NOT NULL,
	"startup_id" integer NOT NULL,
	"label" text NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "followups" (
	"id" serial PRIMARY KEY NOT NULL,
	"draft_id" integer NOT NULL,
	"day_offset" integer NOT NULL,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"status" text DEFAULT 'scheduled' NOT NULL,
	"due_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"resend_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "founders" (
	"id" serial PRIMARY KEY NOT NULL,
	"startup_id" integer NOT NULL,
	"name" text NOT NULL,
	"title" text,
	"email" text,
	"linkedin_url" text,
	"linkedin_match_confidence" real,
	"linkedin_verified" boolean DEFAULT false NOT NULL,
	"posts" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "investors" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"portfolio_url" text NOT NULL,
	"last_snapshot" jsonb,
	"active" boolean DEFAULT true NOT NULL,
	"last_checked_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "investors_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "qualification_config" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"description" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "qualification_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"startup_id" integer,
	"company_domain" text,
	"decision" text NOT NULL,
	"phase" text DEFAULT 'gate' NOT NULL,
	"reason_codes" text[] DEFAULT '{}'::text[] NOT NULL,
	"flags" text[] DEFAULT '{}'::text[] NOT NULL,
	"fit_score" integer,
	"source_urls" text[] DEFAULT '{}'::text[] NOT NULL,
	"config_snapshot" jsonb,
	"run_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"stage" text NOT NULL,
	"trigger" text DEFAULT 'cron' NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"counts" jsonb,
	"errors" jsonb
);
--> statement-breakpoint
CREATE TABLE "sources" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"url" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"last_fetched_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sources_url_unique" UNIQUE("url")
);
--> statement-breakpoint
CREATE TABLE "startup_sources" (
	"startup_id" integer NOT NULL,
	"article_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "startup_sources_startup_id_article_id_pk" PRIMARY KEY("startup_id","article_id")
);
--> statement-breakpoint
CREATE TABLE "startups" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"root_domain" text,
	"normalized_name" text NOT NULL,
	"facts" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"evidence" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"research" jsonb,
	"fit_score" integer,
	"fit_reasons" text[] DEFAULT '{}'::text[] NOT NULL,
	"decision" text DEFAULT 'pending' NOT NULL,
	"stage" text DEFAULT 'extracted' NOT NULL,
	"reason_codes" text[] DEFAULT '{}'::text[] NOT NULL,
	"flags" text[] DEFAULT '{}'::text[] NOT NULL,
	"announced_on" date,
	"hubspot_company_id" text,
	"hubspot_deal_id" text,
	"is_demo" boolean DEFAULT false NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "thesis" (
	"id" serial PRIMARY KEY NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"sectors" text[] NOT NULL,
	"geographies" text[] NOT NULL,
	"business_models" text[] NOT NULL,
	"team_signals" text[] NOT NULL,
	"timing_signals" text[] DEFAULT '{}'::text[] NOT NULL,
	"excluded_sectors" text[] NOT NULL,
	"weights" jsonb NOT NULL,
	"fit_threshold" integer NOT NULL,
	"maybe_threshold" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "contacted" ADD CONSTRAINT "contacted_startup_id_startups_id_fk" FOREIGN KEY ("startup_id") REFERENCES "public"."startups"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drafts" ADD CONSTRAINT "drafts_startup_id_startups_id_fk" FOREIGN KEY ("startup_id") REFERENCES "public"."startups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drafts" ADD CONSTRAINT "drafts_founder_id_founders_id_fk" FOREIGN KEY ("founder_id") REFERENCES "public"."founders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_startup_id_startups_id_fk" FOREIGN KEY ("startup_id") REFERENCES "public"."startups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_startup_id_startups_id_fk" FOREIGN KEY ("startup_id") REFERENCES "public"."startups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "followups" ADD CONSTRAINT "followups_draft_id_drafts_id_fk" FOREIGN KEY ("draft_id") REFERENCES "public"."drafts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "founders" ADD CONSTRAINT "founders_startup_id_startups_id_fk" FOREIGN KEY ("startup_id") REFERENCES "public"."startups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qualification_log" ADD CONSTRAINT "qualification_log_startup_id_startups_id_fk" FOREIGN KEY ("startup_id") REFERENCES "public"."startups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "startup_sources" ADD CONSTRAINT "startup_sources_startup_id_startups_id_fk" FOREIGN KEY ("startup_id") REFERENCES "public"."startups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "startup_sources" ADD CONSTRAINT "startup_sources_article_id_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."articles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "articles_status_idx" ON "articles" USING btree ("status");--> statement-breakpoint
CREATE INDEX "articles_published_idx" ON "articles" USING btree ("published_at");--> statement-breakpoint
CREATE UNIQUE INDEX "contacted_domain_uq" ON "contacted" USING btree ("root_domain");--> statement-breakpoint
CREATE INDEX "contacted_name_idx" ON "contacted" USING btree ("normalized_name");--> statement-breakpoint
CREATE INDEX "dnc_domain_idx" ON "do_not_contact" USING btree ("root_domain");--> statement-breakpoint
CREATE INDEX "dnc_email_idx" ON "do_not_contact" USING btree ("email");--> statement-breakpoint
CREATE INDEX "drafts_status_idx" ON "drafts" USING btree ("status");--> statement-breakpoint
CREATE INDEX "drafts_resend_idx" ON "drafts" USING btree ("resend_id");--> statement-breakpoint
CREATE INDEX "events_startup_idx" ON "events" USING btree ("startup_id");--> statement-breakpoint
CREATE INDEX "events_created_idx" ON "events" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "followups_draft_day_uq" ON "followups" USING btree ("draft_id","day_offset");--> statement-breakpoint
CREATE INDEX "followups_due_idx" ON "followups" USING btree ("status","due_at");--> statement-breakpoint
CREATE UNIQUE INDEX "founders_startup_name_uq" ON "founders" USING btree ("startup_id","name");--> statement-breakpoint
CREATE INDEX "qlog_startup_idx" ON "qualification_log" USING btree ("startup_id");--> statement-breakpoint
CREATE INDEX "qlog_run_idx" ON "qualification_log" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "runs_stage_started_idx" ON "runs" USING btree ("stage","started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "startups_root_domain_uq" ON "startups" USING btree ("root_domain");--> statement-breakpoint
CREATE UNIQUE INDEX "startups_name_no_domain_uq" ON "startups" USING btree ("normalized_name") WHERE "startups"."root_domain" is null;--> statement-breakpoint
CREATE INDEX "startups_normalized_name_idx" ON "startups" USING btree ("normalized_name");--> statement-breakpoint
CREATE INDEX "startups_decision_idx" ON "startups" USING btree ("decision");--> statement-breakpoint
CREATE INDEX "startups_stage_idx" ON "startups" USING btree ("stage");--> statement-breakpoint
CREATE UNIQUE INDEX "thesis_single_active_uq" ON "thesis" USING btree ("active") WHERE "thesis"."active";
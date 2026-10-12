ALTER TABLE "drafts" ADD COLUMN "clicked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "drafts" ADD COLUMN "delivered_to" text;--> statement-breakpoint
ALTER TABLE "followups" ADD COLUMN "opened_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "followups" ADD COLUMN "clicked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "followups" ADD COLUMN "delivered_to" text;--> statement-breakpoint
ALTER TABLE "followups" ADD COLUMN "edited_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "founders" ADD COLUMN "email_source" text;--> statement-breakpoint
ALTER TABLE "startups" ADD COLUMN "deal_stage" text;
ALTER TABLE "articles" ADD COLUMN "title_hash" text;--> statement-breakpoint
CREATE INDEX "articles_title_hash_idx" ON "articles" USING btree ("title_hash");
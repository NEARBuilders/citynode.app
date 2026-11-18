ALTER TABLE "nodes" ADD COLUMN "bulletin_published_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "nodes" ADD COLUMN "bulletin_published_by" text;--> statement-breakpoint
ALTER TABLE "nodes" ADD COLUMN "bulletin_publisher_name" text;

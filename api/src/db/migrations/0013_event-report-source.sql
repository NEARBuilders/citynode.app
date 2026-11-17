CREATE TYPE "public"."event_report_source" AS ENUM('app', 'import');--> statement-breakpoint
ALTER TABLE "event_reports" ADD COLUMN "source" "event_report_source" DEFAULT 'app' NOT NULL;
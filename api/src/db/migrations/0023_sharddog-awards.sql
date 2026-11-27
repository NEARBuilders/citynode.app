CREATE TYPE "public"."sharddog_award_kind" AS ENUM('membership', 'event');--> statement-breakpoint
CREATE TYPE "public"."sharddog_award_status" AS ENUM('pending', 'awarded');--> statement-breakpoint
CREATE TABLE "sharddog_awards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"user_id" text NOT NULL,
	"kind" "sharddog_award_kind" NOT NULL,
	"event_id" text,
	"drop_id" text NOT NULL,
	"account_id" text,
	"status" "sharddog_award_status" DEFAULT 'pending' NOT NULL,
	"view_url" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"attempted_at" timestamp with time zone,
	"awarded_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "attendance_check_ins" ADD COLUMN "account_id" text;--> statement-breakpoint
CREATE UNIQUE INDEX "sharddog_awards_membership_once" ON "sharddog_awards" USING btree ("organization_id","user_id") WHERE kind = 'membership';--> statement-breakpoint
CREATE UNIQUE INDEX "sharddog_awards_event_once" ON "sharddog_awards" USING btree ("organization_id","user_id","event_id") WHERE kind = 'event';--> statement-breakpoint
CREATE INDEX "sharddog_awards_user" ON "sharddog_awards" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sharddog_awards_pending" ON "sharddog_awards" USING btree ("status","organization_id");--> statement-breakpoint
DELETE FROM "attendance_code_checkpoints";--> statement-breakpoint
DELETE FROM "attendance_event_reconciliations";
CREATE TYPE "public"."team_join_request_closed_reason" AS ENUM('requester_left', 'team_deleted', 'team_not_joinable');--> statement-breakpoint
CREATE TYPE "public"."team_join_request_status" AS ENUM('pending', 'approved', 'declined', 'withdrawn', 'closed');--> statement-breakpoint
CREATE TABLE "team_join_endorsements" (
	"request_id" uuid NOT NULL,
	"endorser_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "team_join_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"team_id" text NOT NULL,
	"team_name" text NOT NULL,
	"team_areas" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"requester_user_id" text NOT NULL,
	"requester_name" text,
	"status" "team_join_request_status" DEFAULT 'pending' NOT NULL,
	"decided_by_user_id" text,
	"decided_at" timestamp with time zone,
	"closed_reason" "team_join_request_closed_reason",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "team_join_endorsements" ADD CONSTRAINT "team_join_endorsements_request_id_team_join_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."team_join_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "team_join_endorsements_once" ON "team_join_endorsements" USING btree ("request_id","endorser_user_id");--> statement-breakpoint
CREATE INDEX "team_join_requests_organization" ON "team_join_requests" USING btree ("organization_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "team_join_requests_one_pending" ON "team_join_requests" USING btree ("team_id","requester_user_id") WHERE "team_join_requests"."status" = 'pending';
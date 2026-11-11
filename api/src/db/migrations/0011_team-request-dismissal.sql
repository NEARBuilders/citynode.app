ALTER TABLE "team_join_requests" ADD COLUMN "dismissed_at" timestamp with time zone;--> statement-breakpoint
UPDATE "team_join_requests" SET "dismissed_at" = COALESCE("decided_at", now()) WHERE "status" IN ('approved', 'declined');

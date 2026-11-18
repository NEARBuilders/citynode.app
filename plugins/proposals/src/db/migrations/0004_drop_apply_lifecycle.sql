INSERT INTO "proposal_audit_log" ("id", "proposal_id", "plugin_id", "entity_id", "action", "actor", "actor_label", "details", "created_at")
SELECT 'audit_0004_' || "id", "id", "plugin_id", "entity_id", 'reopened', 'system', 'System', '{"reason":"community_setup_retired"}', now()
FROM "proposals"
WHERE "plugin_id" = 'node' AND "review_status" = 'approved' AND "apply_status" IN ('applying', 'failed')
ON CONFLICT ("id") DO NOTHING;
--> statement-breakpoint
UPDATE "proposals" SET "review_status" = 'pending', "updated_at" = now()
WHERE "plugin_id" = 'node' AND "review_status" = 'approved' AND "apply_status" IN ('applying', 'failed');
--> statement-breakpoint
ALTER TABLE "proposals" DROP COLUMN IF EXISTS "apply_status";
--> statement-breakpoint
ALTER TABLE "proposals" DROP COLUMN IF EXISTS "apply_error";
--> statement-breakpoint
ALTER TABLE "proposals" DROP COLUMN IF EXISTS "applied_resource_id";
--> statement-breakpoint
ALTER TABLE "proposals" DROP COLUMN IF EXISTS "apply_steps";
--> statement-breakpoint
ALTER TABLE "proposals" DROP COLUMN IF EXISTS "apply_activity_at";
--> statement-breakpoint
ALTER TABLE "proposals" DROP COLUMN IF EXISTS "applied_at";
--> statement-breakpoint
ALTER TABLE "proposals" DROP COLUMN IF EXISTS "remove_status";
--> statement-breakpoint
ALTER TABLE "proposals" DROP COLUMN IF EXISTS "remove_error";
--> statement-breakpoint
ALTER TABLE "proposals" DROP COLUMN IF EXISTS "removed_at";

ALTER TABLE "organization" ADD COLUMN "default_teams_provisioned_at" timestamp with time zone;
--> statement-breakpoint
INSERT INTO "team" ("id", "name", "organization_id", "metadata")
SELECT 'default-team:' || o."id" || ':' || d.key, d.name, o."id", d.metadata
FROM "organization" o
CROSS JOIN (VALUES
  ('operations', 'Operations', '{"areas":["node-operations"]}'),
  ('treasury', 'Treasury', '{"areas":["finance","stake"]}'),
  ('community', 'Community', '{"areas":["things","events"]}')
) AS d(key, name, metadata)
WHERE o."status" = 'active'
  AND NOT EXISTS (SELECT 1 FROM "user" u WHERE u."id" = o."slug")
  AND NOT EXISTS (SELECT 1 FROM "team" t WHERE t."organization_id" = o."id" AND t."name" = d.name);
--> statement-breakpoint
UPDATE "organization" o SET "default_teams_provisioned_at" = now()
WHERE o."status" = 'active'
  AND NOT EXISTS (SELECT 1 FROM "user" u WHERE u."id" = o."slug");

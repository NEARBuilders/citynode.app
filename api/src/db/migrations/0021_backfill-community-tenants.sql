UPDATE "nodes" SET "tenant_id" = "owned"."id"
FROM (
  SELECT DISTINCT ON ("org_id") "id", "org_id"
  FROM "tenants"
  WHERE "org_id" IS NOT NULL AND "deleted_at" IS NULL
  ORDER BY "org_id", "created_at"
) AS "owned"
WHERE "nodes"."tenant_id" IS NULL
  AND "nodes"."place_id" IS NOT NULL
  AND "nodes"."org_id" = "owned"."org_id";--> statement-breakpoint
INSERT INTO "tenants" ("account_id", "org_id", "name", "status", "owner_kind", "allow_ui_overrides")
SELECT "places"."slug" || '.v1.citynode.near', "nodes"."org_id", "places"."name", 'active', 'platform', false
FROM "nodes"
INNER JOIN "places" ON "places"."id" = "nodes"."place_id"
WHERE "nodes"."tenant_id" IS NULL
  AND "nodes"."org_id" IS NOT NULL
ON CONFLICT ("account_id") DO NOTHING;--> statement-breakpoint
UPDATE "nodes" SET "tenant_id" = "tenants"."id"
FROM "places", "tenants"
WHERE "nodes"."tenant_id" IS NULL
  AND "nodes"."org_id" IS NOT NULL
  AND "places"."id" = "nodes"."place_id"
  AND "tenants"."account_id" = "places"."slug" || '.v1.citynode.near'
  AND "tenants"."org_id" = "nodes"."org_id"
  AND "tenants"."deleted_at" IS NULL;

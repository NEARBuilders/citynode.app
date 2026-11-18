SELECT ('node ' || "id" || ' has no place. Link every community node to a place (the backfill-node-places script in earlier releases) before dropping the legacy node columns')::integer
FROM "nodes"
WHERE "place_id" IS NULL AND coalesce("metadata"->>'kind', '') <> 'platform'
LIMIT 1;
--> statement-breakpoint
INSERT INTO "place_aliases" ("value", "kind", "place_id")
SELECT DISTINCT ON ("legacy"."slug") "legacy"."slug", 'legacy', "legacy"."place_id"
FROM (
  SELECT lower(to_jsonb("nodes") ->> 'slug') AS "slug", "nodes"."place_id", "nodes"."created_at"
  FROM "nodes"
  WHERE "nodes"."place_id" IS NOT NULL
) AS "legacy"
INNER JOIN "places" ON "places"."id" = "legacy"."place_id"
WHERE "legacy"."slug" IS NOT NULL
  AND "legacy"."slug" <> "places"."slug"
  AND NOT EXISTS (SELECT 1 FROM "places" AS "taken" WHERE "taken"."slug" = "legacy"."slug")
ORDER BY "legacy"."slug", "legacy"."created_at"
ON CONFLICT ("value") DO NOTHING;
--> statement-breakpoint
ALTER TABLE "nodes" DROP CONSTRAINT IF EXISTS "nodes_parent_id_nodes_id_fk";
--> statement-breakpoint
DROP INDEX IF EXISTS "nodes_parent_slug_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "nodes_root_slug_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "nodes_parent_idx";--> statement-breakpoint
ALTER TABLE "nodes" DROP COLUMN IF EXISTS "slug";--> statement-breakpoint
ALTER TABLE "nodes" DROP COLUMN IF EXISTS "name";--> statement-breakpoint
ALTER TABLE "nodes" DROP COLUMN IF EXISTS "parent_id";

UPDATE "nodes" SET "metadata" = "nodes"."metadata" || jsonb_build_object(
  'daoAccountId', "tenants"."account_id",
  'daoNetwork', CASE WHEN lower("tenants"."account_id") LIKE '%.testnet' THEN 'testnet' ELSE 'mainnet' END
)
FROM "tenants"
WHERE "nodes"."tenant_id" = "tenants"."id"
  AND "tenants"."owner_kind" = 'dao'
  AND "tenants"."deleted_at" IS NULL
  AND NOT ("nodes"."metadata" ? 'daoAccountId');

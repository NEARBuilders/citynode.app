ALTER TABLE "onboarding_redemption" ADD COLUMN "new_member" boolean;--> statement-breakpoint
UPDATE "onboarding_redemption" r
SET "new_member" = timing."new_member"
FROM (
  SELECT
    pending."id",
    bool_or(m."created_at" >= pending."created_at" - interval '5 seconds') AS "new_member"
  FROM "onboarding_redemption" pending
  JOIN "onboarding_code" c ON c."id" = pending."code_id"
  JOIN "member" m
    ON m."user_id" = pending."user_id"
    AND m."organization_id" = c."organization_id"
    AND m."created_at" <= pending."created_at"
  WHERE pending."new_member" IS NULL
  GROUP BY pending."id"
) timing
WHERE r."id" = timing."id";

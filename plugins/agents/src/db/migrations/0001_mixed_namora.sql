CREATE TABLE "owner_receipts" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"agent_id" text NOT NULL,
	"action" text NOT NULL,
	"target_id" text NOT NULL,
	"owner_epoch" bigint NOT NULL,
	"nonce" text NOT NULL,
	"payload_hash" text NOT NULL,
	"message" jsonb NOT NULL,
	"proof" jsonb NOT NULL,
	"original" jsonb,
	"verification" jsonb NOT NULL,
	"decided_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quota_changes" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"revision" integer NOT NULL,
	"operator" text NOT NULL,
	"reason" text NOT NULL,
	"previous" jsonb NOT NULL,
	"profile" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_grants" ALTER COLUMN "recipients" SET DATA TYPE jsonb USING to_jsonb("recipients");--> statement-breakpoint
ALTER TABLE "agent_grants" ADD COLUMN "signing_audiences" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "quota_profile" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "quota_revision" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "owner_receipts" ADD CONSTRAINT "owner_receipts_tenant_id_agent_id_agents_tenant_id_id_fk" FOREIGN KEY ("tenant_id","agent_id") REFERENCES "public"."agents"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quota_changes" ADD CONSTRAINT "quota_changes_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "owner_receipts_nonce" ON "owner_receipts" USING btree ("tenant_id","agent_id","nonce");--> statement-breakpoint
CREATE UNIQUE INDEX "quota_changes_revision" ON "quota_changes" USING btree ("tenant_id","revision");
--> statement-breakpoint
UPDATE "agent_grants" SET "revoked_at" = COALESCE("revoked_at", clock_timestamp()), "revoked_reason" = COALESCE("revoked_reason", 'typed_destinations_reauthorization_required') WHERE "owner_message"->>'domain' IS DISTINCT FROM 'near-intents-agent-api.agent-grant.v4';

CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"accountId" text NOT NULL,
	"providerId" text NOT NULL,
	"userId" text NOT NULL,
	"accessToken" text,
	"refreshToken" text,
	"idToken" text,
	"accessTokenExpiresAt" timestamp with time zone,
	"refreshTokenExpiresAt" timestamp with time zone,
	"scope" text,
	"password" text,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_grants" (
	"id" text NOT NULL,
	"tenant_id" text NOT NULL,
	"agent_id" text NOT NULL,
	"wallet_id" text NOT NULL,
	"label" text NOT NULL,
	"credential_hash" text NOT NULL,
	"actions" text[] NOT NULL,
	"recipients" text[] NOT NULL,
	"owner_epoch" bigint NOT NULL,
	"issued_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"revoked_reason" text,
	"owner_message" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_grants_tenant_id_agent_id_id_pk" PRIMARY KEY("tenant_id","agent_id","id")
);
--> statement-breakpoint
CREATE TABLE "agents" (
	"id" text NOT NULL,
	"tenant_id" text NOT NULL,
	"name" text NOT NULL,
	"external_user_id" text,
	"owner_identity" jsonb,
	"owner_near" jsonb,
	"owner_counter" bigint DEFAULT 0 NOT NULL,
	"owner_account_id" text,
	"owner_public_key" text,
	"owner_epoch" bigint DEFAULT 1 NOT NULL,
	"timelock_delay_seconds" integer DEFAULT 0 NOT NULL,
	"timelock_revision" integer DEFAULT 0 NOT NULL,
	"budget_daily_cents" bigint,
	"budget_weekly_cents" bigint,
	"budget_monthly_cents" bigint,
	"budget_revision" integer DEFAULT 0 NOT NULL,
	"policy_epoch" bigint DEFAULT 1 NOT NULL,
	"lifecycle_epoch" bigint DEFAULT 1 NOT NULL,
	"lifecycle" text DEFAULT 'pending' NOT NULL,
	"archived_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agents_tenant_id_id_pk" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "agents_lifecycle_check" CHECK ("agents"."lifecycle" IN ('pending', 'active', 'archived', 'deleted', 'abandoned'))
);
--> statement-breakpoint
CREATE TABLE "api_keys" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"name" text NOT NULL,
	"token_hash" text NOT NULL,
	"prefix" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "api_keys_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"agent_id" text,
	"action" text NOT NULL,
	"resource_id" text NOT NULL,
	"actor_key_id" text,
	"actor_owner_id" text,
	"grant_id" text,
	"owner_epoch" bigint,
	"policy_epoch" bigint,
	"lifecycle_epoch" bigint,
	"request_hash" text,
	"provider_reference" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_retention_holds" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"agent_id" text,
	"reason" text NOT NULL,
	"released_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "custody_wallets" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"agent_id" text NOT NULL,
	"provider_wallet_id" text NOT NULL,
	"near_account_id" text NOT NULL,
	"evm_address" text NOT NULL,
	"credential_ciphertext" text NOT NULL,
	"credential_nonce" text NOT NULL,
	"credential_key_id" text NOT NULL,
	"status" text NOT NULL,
	"failure_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "custody_wallets_agent" UNIQUE("tenant_id","agent_id"),
	CONSTRAINT "custody_wallets_status_check" CHECK ("custody_wallets"."status" IN ('provisioning', 'active', 'failed', 'deleted'))
);
--> statement-breakpoint
CREATE TABLE "delayed_executions" (
	"tenant_id" text NOT NULL,
	"agent_id" text NOT NULL,
	"id" text NOT NULL,
	"grant_id" text NOT NULL,
	"owner_epoch" bigint NOT NULL,
	"execute_after" timestamp with time zone NOT NULL,
	"state" text DEFAULT 'waiting' NOT NULL,
	"ciphertext" text,
	"nonce" text,
	"key_id" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "delayed_executions_tenant_id_agent_id_id_pk" PRIMARY KEY("tenant_id","agent_id","id"),
	CONSTRAINT "delayed_executions_state" CHECK ("delayed_executions"."state" IN ('waiting', 'dispatching', 'finished', 'cancelled', 'uncertain'))
);
--> statement-breakpoint
CREATE TABLE "intent_generations" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"idempotency_key" text,
	"request_hash" text NOT NULL,
	"agent_id" text NOT NULL,
	"state" text DEFAULT 'reserved' NOT NULL,
	"draft" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "intent_generations_idempotency" UNIQUE("tenant_id","idempotency_key"),
	CONSTRAINT "intent_generations_state_check" CHECK ("intent_generations"."state" IN ('reserved', 'building', 'ready'))
);
--> statement-breakpoint
CREATE TABLE "operation_artifacts" (
	"tenant_id" text NOT NULL,
	"agent_id" text NOT NULL,
	"operation_id" text NOT NULL,
	"grant_id" text NOT NULL,
	"owner_epoch" bigint NOT NULL,
	"action" text NOT NULL,
	"ciphertext" text,
	"key_id" text,
	"nonce" text,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "operation_artifacts_tenant_id_agent_id_operation_id_pk" PRIMARY KEY("tenant_id","agent_id","operation_id"),
	CONSTRAINT "operation_artifacts_action_check" CHECK ("operation_artifacts"."action" IN ('near_message', 'evm_message', 'evm_typed_data', 'evm_transaction')),
	CONSTRAINT "operation_artifacts_payload_state_check" CHECK (("operation_artifacts"."consumed_at" IS NULL AND "operation_artifacts"."ciphertext" IS NOT NULL AND "operation_artifacts"."key_id" IS NOT NULL AND "operation_artifacts"."nonce" IS NOT NULL) OR ("operation_artifacts"."consumed_at" IS NOT NULL AND "operation_artifacts"."ciphertext" IS NULL AND "operation_artifacts"."key_id" IS NULL AND "operation_artifacts"."nonce" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "operation_tombstones" (
	"tenant_id" text NOT NULL,
	"agent_id" text NOT NULL,
	"id" text NOT NULL,
	"request_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "operation_tombstones_tenant_id_agent_id_id_pk" PRIMARY KEY("tenant_id","agent_id","id")
);
--> statement-breakpoint
CREATE TABLE "operations" (
	"id" text NOT NULL,
	"tenant_id" text NOT NULL,
	"agent_id" text NOT NULL,
	"actor_key_id" text,
	"kind" text NOT NULL,
	"action" text,
	"request_hash" text NOT NULL,
	"status" text NOT NULL,
	"authorized_owner_epoch" bigint,
	"authorized_policy_epoch" bigint,
	"authorized_lifecycle_epoch" bigint,
	"authorized_grant_id" text,
	"authorized_grant_label" text,
	"dispatch_claimed_at" timestamp with time zone,
	"dispatch_committed_at" timestamp with time zone,
	"result" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "operations_tenant_id_agent_id_id_pk" PRIMARY KEY("tenant_id","agent_id","id"),
	CONSTRAINT "operations_status_check" CHECK ("operations"."status" IN ('pending', 'completed', 'uncertain', 'failed')),
	CONSTRAINT "operations_kind_check" CHECK ("operations"."kind" IN ('sign', 'execute', 'relay', 'policy')),
	CONSTRAINT "operations_sign_result_safe_check" CHECK ("operations"."kind" <> 'sign' OR "operations"."result" IS NULL OR (
        jsonb_typeof("operations"."result") = 'object'
        AND "operations"."result"->'redacted' = 'true'::jsonb
        AND "operations"."result"->'artifact_redacted' = 'true'::jsonb
        AND jsonb_typeof("operations"."result"->'status') = 'string'
        AND "operations"."result"->>'status' IN (
          'pending', 'pending_approval', 'pending_deposit',
          'pending_wallet_signature', 'processing', 'approved', 'success', 'partially_failed',
          'failed', 'refunded', 'rejected', 'expired', 'cancelled', 'needs_review', 'unknown',
          'completed', 'uncertain', 'dispatching', 'submitted', 'applied'
        )
        AND ("operations"."result" - ARRAY['redacted', 'artifact_redacted', 'status', 'failure_code', 'provider_request_id']) = '{}'::jsonb
        AND (NOT ("operations"."result" ? 'failure_code') OR (
          jsonb_typeof("operations"."result"->'failure_code') = 'string'
          AND char_length("operations"."result"->>'failure_code') <= 256
        ))
        AND (NOT ("operations"."result" ? 'provider_request_id') OR (
          "operations"."result"->'provider_request_id' = 'null'::jsonb OR (
            jsonb_typeof("operations"."result"->'provider_request_id') = 'string'
            AND char_length("operations"."result"->>'provider_request_id') <= 128
          )
        ))
      ))
);
--> statement-breakpoint
CREATE TABLE "owner_intents" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"agent_id" text NOT NULL,
	"actor_key_id" text NOT NULL,
	"type" text NOT NULL,
	"standard" text NOT NULL,
	"signer" jsonb NOT NULL,
	"intent" jsonb NOT NULL,
	"context" jsonb NOT NULL,
	"preview" jsonb NOT NULL,
	"state" text DEFAULT 'pending_signature' NOT NULL,
	"operation_id" text,
	"result" jsonb,
	"failure_code" text,
	"idempotency_key" text,
	"request_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "owner_intents_idempotency" UNIQUE("tenant_id","idempotency_key"),
	CONSTRAINT "owner_intents_state_check" CHECK ("owner_intents"."state" IN ('pending_signature', 'submitted', 'completed', 'failed')),
	CONSTRAINT "owner_intents_standard_check" CHECK ("owner_intents"."standard" IN ('nep413', 'nep366', 'eip712', 'webauthn'))
);
--> statement-breakpoint
CREATE TABLE "owner_nonces" (
	"nonce" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"agent_id" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rateLimit" (
	"id" text PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"count" integer NOT NULL,
	"lastRequest" bigint NOT NULL,
	CONSTRAINT "rateLimit_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "request_buckets" (
	"key" text PRIMARY KEY NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expiresAt" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	"ipAddress" text,
	"userAgent" text,
	"userId" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "spend_charges" (
	"operation_id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"agent_id" text NOT NULL,
	"action" text NOT NULL,
	"asset" text NOT NULL,
	"amount" text NOT NULL,
	"usd_micros" bigint NOT NULL,
	"decimals" integer NOT NULL,
	"price_coefficient" text NOT NULL,
	"price_scale" integer NOT NULL,
	"price_updated_at" timestamp with time zone NOT NULL,
	"budget_revision" integer NOT NULL,
	"dispatch_token" text NOT NULL,
	"state" text NOT NULL,
	"charged_at" timestamp with time zone NOT NULL,
	"released_at" timestamp with time zone,
	CONSTRAINT "spend_charges_state_check" CHECK ("spend_charges"."state" IN ('committed', 'released')),
	CONSTRAINT "spend_charges_release_check" CHECK (("spend_charges"."state" = 'released') = ("spend_charges"."released_at" IS NOT NULL)),
	CONSTRAINT "spend_charges_usd_check" CHECK ("spend_charges"."usd_micros" >= 0)
);
--> statement-breakpoint
CREATE TABLE "sponsor_reservations" (
	"operation_id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"agent_id" text NOT NULL,
	"state" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"released_at" timestamp with time zone,
	CONSTRAINT "sponsor_reservations_state_check" CHECK ("sponsor_reservations"."state" IN ('reserved', 'committed', 'released')),
	CONSTRAINT "sponsor_reservations_release_check" CHECK (("sponsor_reservations"."state" = 'released') = ("sponsor_reservations"."released_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "tenants" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tenants_owner_user_id_unique" UNIQUE("owner_user_id")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"emailVerified" boolean DEFAULT false NOT NULL,
	"image" text,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expiresAt" timestamp with time zone NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wallet_policies" (
	"id" text NOT NULL,
	"tenant_id" text NOT NULL,
	"agent_id" text NOT NULL,
	"wallet_id" text NOT NULL,
	"version" integer NOT NULL,
	"policy_hash" text NOT NULL,
	"encrypted_data" text NOT NULL,
	"signature_hex" text NOT NULL,
	"public_key_hex" text NOT NULL,
	"rules" jsonb NOT NULL,
	"status" text NOT NULL,
	"transaction_hash" text,
	"applied_at" timestamp with time zone,
	"failure_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wallet_policies_tenant_id_agent_id_id_pk" PRIMARY KEY("tenant_id","agent_id","id"),
	CONSTRAINT "wallet_policies_status_check" CHECK ("wallet_policies"."status" IN ('draft', 'discarded', 'signed', 'applied', 'failed'))
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_grants" ADD CONSTRAINT "agent_grants_tenant_id_agent_id_agents_tenant_id_id_fk" FOREIGN KEY ("tenant_id","agent_id") REFERENCES "public"."agents"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_retention_holds" ADD CONSTRAINT "audit_retention_holds_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custody_wallets" ADD CONSTRAINT "custody_wallets_tenant_id_agent_id_agents_tenant_id_id_fk" FOREIGN KEY ("tenant_id","agent_id") REFERENCES "public"."agents"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delayed_executions" ADD CONSTRAINT "delayed_executions_tenant_id_agent_id_id_operations_tenant_id_agent_id_id_fk" FOREIGN KEY ("tenant_id","agent_id","id") REFERENCES "public"."operations"("tenant_id","agent_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intent_generations" ADD CONSTRAINT "intent_generations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operation_artifacts" ADD CONSTRAINT "operation_artifacts_tenant_id_agent_id_operation_id_operations_tenant_id_agent_id_id_fk" FOREIGN KEY ("tenant_id","agent_id","operation_id") REFERENCES "public"."operations"("tenant_id","agent_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operation_artifacts" ADD CONSTRAINT "operation_artifacts_tenant_id_agent_id_grant_id_agent_grants_tenant_id_agent_id_id_fk" FOREIGN KEY ("tenant_id","agent_id","grant_id") REFERENCES "public"."agent_grants"("tenant_id","agent_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operations" ADD CONSTRAINT "operations_tenant_id_agent_id_agents_tenant_id_id_fk" FOREIGN KEY ("tenant_id","agent_id") REFERENCES "public"."agents"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "owner_intents" ADD CONSTRAINT "owner_intents_tenant_id_agent_id_agents_tenant_id_id_fk" FOREIGN KEY ("tenant_id","agent_id") REFERENCES "public"."agents"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenants" ADD CONSTRAINT "tenants_owner_user_id_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_policies" ADD CONSTRAINT "wallet_policies_tenant_id_agent_id_agents_tenant_id_id_fk" FOREIGN KEY ("tenant_id","agent_id") REFERENCES "public"."agents"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_user" ON "account" USING btree ("userId");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_grants_credential" ON "agent_grants" USING btree ("credential_hash");--> statement-breakpoint
CREATE INDEX "agent_grants_agent" ON "agent_grants" USING btree ("tenant_id","agent_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "agents_tenant_created" ON "agents" USING btree ("tenant_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "agents_external_user" ON "agents" USING btree ("tenant_id","external_user_id");--> statement-breakpoint
CREATE INDEX "api_keys_tenant" ON "api_keys" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "audit_events_tenant" ON "audit_events" USING btree ("tenant_id","id");--> statement-breakpoint
CREATE INDEX "audit_events_actor" ON "audit_events" USING btree ("tenant_id","actor_key_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "audit_events_created_at" ON "audit_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "audit_retention_holds_active" ON "audit_retention_holds" USING btree ("tenant_id","agent_id","released_at");--> statement-breakpoint
CREATE INDEX "delayed_executions_due" ON "delayed_executions" USING btree ("state","execute_after");--> statement-breakpoint
CREATE INDEX "operation_artifacts_expires" ON "operation_artifacts" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "operations_tenant_status" ON "operations" USING btree ("tenant_id","status","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "operations_agent_created" ON "operations" USING btree ("tenant_id","agent_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "operations_actor_created" ON "operations" USING btree ("tenant_id","actor_key_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "operations_tenant_id" ON "operations" USING btree ("tenant_id","id");--> statement-breakpoint
CREATE INDEX "owner_intents_agent_created" ON "owner_intents" USING btree ("tenant_id","agent_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "owner_intents_operation" ON "owner_intents" USING btree ("tenant_id","agent_id","operation_id");--> statement-breakpoint
CREATE INDEX "owner_nonces_agent" ON "owner_nonces" USING btree ("tenant_id","agent_id");--> statement-breakpoint
CREATE INDEX "owner_nonces_expires" ON "owner_nonces" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "spend_charges_agent_window" ON "spend_charges" USING btree ("tenant_id","agent_id","charged_at");--> statement-breakpoint
CREATE INDEX "sponsor_reservations_window" ON "sponsor_reservations" USING btree ("created_at","tenant_id","agent_id");--> statement-breakpoint
CREATE INDEX "sponsor_reservations_agent" ON "sponsor_reservations" USING btree ("tenant_id","agent_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "wallet_policies_version" ON "wallet_policies" USING btree ("wallet_id","version") WHERE "wallet_policies"."status" NOT IN ('draft', 'discarded');--> statement-breakpoint
CREATE INDEX "wallet_policies_agent_version" ON "wallet_policies" USING btree ("tenant_id","agent_id","version" DESC NULLS LAST);
CREATE TABLE "attendance_check_ins" (
	"organization_id" text NOT NULL,
	"code_id" text NOT NULL,
	"user_id" text NOT NULL,
	"event_id" text,
	"event_name" text NOT NULL,
	"community_name" text NOT NULL,
	"classified" boolean NOT NULL,
	"checked_in_at" timestamp with time zone NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attendance_check_ins_organization_id_code_id_user_id_pk" PRIMARY KEY("organization_id","code_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "attendance_code_checkpoints" (
	"organization_id" text NOT NULL,
	"code_id" text NOT NULL,
	"used_count" integer NOT NULL,
	"reconciled_at" timestamp with time zone NOT NULL,
	CONSTRAINT "attendance_code_checkpoints_organization_id_code_id_pk" PRIMARY KEY("organization_id","code_id")
);
--> statement-breakpoint
CREATE TABLE "attendance_event_reconciliations" (
	"organization_id" text NOT NULL,
	"event_id" text NOT NULL,
	"truncated" boolean NOT NULL,
	"failed" boolean NOT NULL,
	"reconciled_at" timestamp with time zone NOT NULL,
	CONSTRAINT "attendance_event_reconciliations_organization_id_event_id_pk" PRIMARY KEY("organization_id","event_id")
);
--> statement-breakpoint
CREATE INDEX "attendance_check_in_user" ON "attendance_check_ins" USING btree ("user_id","organization_id");
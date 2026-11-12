CREATE TABLE "monthly_reports" (
	"tenant_id" uuid NOT NULL,
	"month" text NOT NULL,
	"notes" text NOT NULL,
	"events_held" integer NOT NULL,
	"check_ins" integer NOT NULL,
	"joins" integer NOT NULL,
	"new_members" integer NOT NULL,
	"submitted_by" text NOT NULL,
	"submitted_by_name" text,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reviewed_by" text,
	"reviewed_at" timestamp with time zone,
	CONSTRAINT "monthly_reports_tenant_id_month_pk" PRIMARY KEY("tenant_id","month")
);
--> statement-breakpoint
ALTER TABLE "event_reports" ADD COLUMN "reviewed_by" text;--> statement-breakpoint
ALTER TABLE "event_reports" ADD COLUMN "reviewed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "monthly_reports" ADD CONSTRAINT "monthly_reports_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "monthly_reports_month" ON "monthly_reports" USING btree ("month");
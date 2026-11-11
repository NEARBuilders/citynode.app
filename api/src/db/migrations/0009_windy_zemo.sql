CREATE TYPE "public"."place_alias_kind" AS ENUM('geonames', 'iso', 'legacy');--> statement-breakpoint
CREATE TABLE "place_aliases" (
	"value" text PRIMARY KEY NOT NULL,
	"kind" "place_alias_kind" NOT NULL,
	"place_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "places" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"parent_id" uuid,
	"latitude" double precision,
	"longitude" double precision,
	"boundary" jsonb,
	"label" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "places_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "nodes" ADD COLUMN "place_id" uuid;--> statement-breakpoint
ALTER TABLE "nodes" ADD COLUMN "activated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "nodes" ADD COLUMN "activated_by" text;--> statement-breakpoint
ALTER TABLE "place_aliases" ADD CONSTRAINT "place_aliases_place_id_places_id_fk" FOREIGN KEY ("place_id") REFERENCES "public"."places"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "places" ADD CONSTRAINT "places_parent_id_places_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."places"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "places_parent_idx" ON "places" USING btree ("parent_id");--> statement-breakpoint
ALTER TABLE "nodes" ADD CONSTRAINT "nodes_place_id_places_id_fk" FOREIGN KEY ("place_id") REFERENCES "public"."places"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "nodes_place_idx" ON "nodes" USING btree ("place_id") WHERE place_id IS NOT NULL;

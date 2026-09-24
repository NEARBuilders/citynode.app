CREATE TABLE "bundle_objects" (
	"key" text PRIMARY KEY NOT NULL,
	"sha256" text NOT NULL,
	"size" integer NOT NULL,
	"content_type" text NOT NULL,
	"bytes" "bytea" NOT NULL,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL
);

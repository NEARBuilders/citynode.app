ALTER TABLE "invitation" ADD COLUMN "near_network" text;--> statement-breakpoint
CREATE INDEX "invitation_nearNetwork_idx" ON "invitation" USING btree ("near_network");
import { createFileRoute } from "@tanstack/react-router";
import { ProfileSettings } from "./-components/profile-settings";

export const Route = createFileRoute("/_layout/_authenticated/_dashboard/settings/profile")({
  component: ProfileSettings,
});

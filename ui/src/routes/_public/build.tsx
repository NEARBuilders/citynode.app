import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuthClient } from "@/app";
import { memberBuildUrl } from "./-build-destination";

export const Route = createFileRoute("/_public/build")({
  component: BuildRedirect,
});

// KEEP: the route context has no session on a full page load, so the referral lookup decides; signed out it fails and the redirect goes without a code.
function BuildRedirect() {
  const authClient = useAuthClient();
  useEffect(() => {
    let cancelled = false;
    void memberBuildUrl(() => authClient.referrals.dashboard()).then((href) => {
      if (!cancelled) window.location.replace(href);
    });
    return () => {
      cancelled = true;
    };
  }, [authClient]);
  return null;
}

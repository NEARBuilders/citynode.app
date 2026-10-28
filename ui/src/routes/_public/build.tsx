import { createFileRoute, redirect } from "@tanstack/react-router";
import { nearBuildersBuildUrl } from "./-build-destination";

export const Route = createFileRoute("/_public/build")({
  beforeLoad: () => {
    throw redirect({ href: nearBuildersBuildUrl(), reloadDocument: true, replace: true });
  },
});

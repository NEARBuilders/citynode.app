import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_layout/_public/apply")({
  beforeLoad: () => {
    throw redirect({ href: "https://citynode.app/apply" });
  },
  head: () => ({
    meta: [{ title: "Apply | app" }, { name: "description", content: "Apply to run a City Node." }],
  }),
});

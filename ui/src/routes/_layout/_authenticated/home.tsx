import { createFileRoute } from "@tanstack/react-router";
import { UnderConstruction } from "@/components";

export const Route = createFileRoute("/_layout/_authenticated/home")({
  component: AuthenticatedHome,
});

function AuthenticatedHome() {
  return (
    <div className="flex min-h-[80vh] flex-col items-center justify-center">
      <h1 className="text-5xl font-semibold tracking-tight sm:text-7xl">the everything project</h1>
      <div className="mt-8">
        <UnderConstruction />
      </div>
    </div>
  );
}

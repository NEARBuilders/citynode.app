import { ArrowLeftIcon } from "@phosphor-icons/react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { getActiveRuntime, useApiClient } from "@/app";
import { useClientValue } from "@/hooks";
import { getGatewayOrigin } from "@/lib/gateway-origin";
import { returnPath } from "@/lib/return-path";
import { OnboardingStation } from "./-onboarding-station";

type StationSearch = { org?: string; from?: string };

export const Route = createFileRoute("/_authenticated/onboarding/station/$codeId")({
  validateSearch: (search: Record<string, unknown>): StationSearch => ({
    org: typeof search.org === "string" && search.org ? search.org : undefined,
    from: returnPath(search.from),
  }),
  head: () => ({ meta: [{ title: "Onboarding station" }] }),
  component: OnboardingStationPage,
});

function OnboardingStationPage() {
  const { codeId } = Route.useParams();
  const { org, from } = Route.useSearch();
  const navigate = useNavigate();
  const { runtimeConfig } = Route.useRouteContext();
  const apiClient = useApiClient();
  const gatewayOrigin = useClientValue<string | null>(
    () => getGatewayOrigin(getActiveRuntime(runtimeConfig)?.gatewayId),
    null,
  );

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="flex items-center px-6 py-4">
        <button
          type="button"
          onClick={() => void navigate({ href: from ?? "/dashboard" })}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          data-testid="station.exit"
        >
          <ArrowLeftIcon className="size-4" />
          Exit station
        </button>
      </header>
      {gatewayOrigin && (
        <OnboardingStation
          apiClient={apiClient}
          codeId={codeId}
          organizationId={org}
          gatewayOrigin={gatewayOrigin}
        />
      )}
    </div>
  );
}

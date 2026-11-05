import { ArrowLeftIcon, ArrowsInIcon, ArrowsOutIcon, LinkBreakIcon } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { useApiClient } from "@/app";
import { Button, EmptyState, Skeleton } from "@/components";
import { useClientValue } from "@/hooks";
import { appErrorMessage } from "@/i18n/error-message";
import { resolveAppLocale, translateAppMessage, useAppTranslation } from "@/i18n/runtime";
import { onboardingLinkUrl } from "@/lib/gateway-origin";
import { onboardingLinksQueryOptions, useGatewayOrigin } from "@/lib/onboarding-links";
import { pageTitle } from "@/lib/page-title";
import { returnPath } from "@/lib/return-path";

type LinkSearch = { org: string; from?: string };

export const Route = createFileRoute("/_authenticated/onboarding/link/$linkId")({
  validateSearch: (search: Record<string, unknown>): LinkSearch => ({
    org: typeof search.org === "string" ? search.org : "",
    from: returnPath(search.from),
  }),
  head: ({ match }) => ({
    meta: [
      {
        title: pageTitle(
          translateAppMessage(
            "links.title",
            undefined,
            resolveAppLocale(undefined, match.context.locale),
          ),
          match.context.runtimeConfig,
        ),
      },
    ],
  }),
  component: OnboardingLinkPage,
});

function OnboardingLinkPage() {
  const translate = useAppTranslation();
  const { linkId } = Route.useParams();
  const { org, from } = Route.useSearch();
  const navigate = useNavigate();
  const apiClient = useApiClient();
  const gatewayOrigin = useGatewayOrigin();
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const canFullscreen = useClientValue(() => document.fullscreenEnabled === true, false);

  const links = useQuery({
    ...onboardingLinksQueryOptions(apiClient, org),
    enabled: !!org,
    refetchInterval: 5_000,
  });
  const link = links.data?.find((candidate) => candidate.id === linkId) ?? null;
  const shortUrl = link && gatewayOrigin ? onboardingLinkUrl(gatewayOrigin, link.slug) : null;

  useEffect(() => {
    if (!shortUrl) return;
    let active = true;
    void QRCode.toDataURL(shortUrl, { width: 960, margin: 2 }).then((dataUrl) => {
      if (active) setQrDataUrl(dataUrl);
    });
    return () => {
      active = false;
    };
  }, [shortUrl]);

  useEffect(() => {
    const onChange = () => setFullscreen(document.fullscreenElement !== null);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen().catch(() => {});
  };

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="flex items-center justify-between gap-3 px-4 py-4 sm:px-6">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => void navigate({ href: from ?? "/dashboard" })}
          data-testid="links.exit"
        >
          <ArrowLeftIcon data-icon="inline-start" />
          {translate("station.exit")}
        </Button>
        {canFullscreen && (
          <Button type="button" variant="ghost" size="sm" onClick={toggleFullscreen}>
            {fullscreen ? (
              <ArrowsInIcon data-icon="inline-start" />
            ) : (
              <ArrowsOutIcon data-icon="inline-start" />
            )}
            {fullscreen ? translate("station.exitFullscreen") : translate("station.fullscreen")}
          </Button>
        )}
      </header>
      <main className="flex flex-1 flex-col items-center justify-center gap-6 px-4 pb-10">
        {!org ? (
          <EmptyState icon={LinkBreakIcon} title={translate("links.inactiveTitle")} />
        ) : links.isPending ? (
          <Skeleton className="aspect-square w-full max-w-md" />
        ) : links.isError ? (
          <p role="alert" className="text-muted-foreground">
            {appErrorMessage(links.error, translate)}
          </p>
        ) : !link?.enabled ? (
          <EmptyState icon={LinkBreakIcon} title={translate("links.inactiveTitle")} />
        ) : (
          <>
            <h1 className="text-center text-3xl font-semibold text-foreground sm:text-4xl">
              {link.name}
            </h1>
            {qrDataUrl ? (
              <img
                src={qrDataUrl}
                alt={translate("links.qrAlt", { name: link.name })}
                className="aspect-square w-full max-w-md rounded-2xl bg-card"
                data-testid="links.qr"
              />
            ) : (
              <Skeleton className="aspect-square w-full max-w-md" />
            )}
            {shortUrl && <p className="font-mono text-sm text-muted-foreground">{shortUrl}</p>}
            <p className="text-sm text-muted-foreground" data-testid="links.live-visits">
              {translate("links.visits", { count: link.visitCount })}
            </p>
          </>
        )}
      </main>
    </div>
  );
}

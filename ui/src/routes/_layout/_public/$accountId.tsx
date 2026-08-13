import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { getSocialImageMeta } from "everything-dev/ui/metadata";
import { ExternalLink, Globe, User } from "lucide-react";
import { useApiClient, useAuthClient } from "@/app";
import { Avatar, AvatarFallback, AvatarImage, Badge, PageContainer } from "@/components";
import { getNearInitials, resolveNearImageUrl } from "@/lib/near-profile";

export const Route = createFileRoute("/_layout/_public/$accountId")({
  loader: async ({ params, context }) => {
    const { queryClient, authClient, apiClient, runtimeConfig } = context;
    const accountId = params.accountId;

    await Promise.all([
      queryClient.prefetchQuery({
        queryKey: ["near-profile", accountId],
        queryFn: async () => {
          const { data } = await authClient.near.getProfile(accountId);
          return data ?? null;
        },
        staleTime: 5 * 60 * 1000,
      }),
      queryClient.prefetchQuery({
        queryKey: ["apps-account", accountId],
        queryFn: () => apiClient.apps.getRegistryAppsByAccount({ accountId }),
        staleTime: 30_000,
      }),
    ]);

    return { accountId, hostUrl: runtimeConfig?.hostUrl ?? "" };
  },
  head: ({ loaderData, params }) => {
    const accountId = params.accountId;
    const hostUrl = (loaderData?.hostUrl ?? "").replace(/\/$/, "");
    const siteUrl = hostUrl ? `${hostUrl}/${accountId}` : "";
    const title = `${accountId} | everything.dev`;
    const description = `${accountId}'s public profile on everything.dev.`;

    return {
      meta: [
        { title },
        { name: "description", content: description },
        ...getSocialImageMeta({
          imageUrl: hostUrl ? `${hostUrl}/metadata.png` : "/metadata.png",
          title,
          description,
          siteName: "everything.dev",
          siteUrl,
          type: "profile",
          alt: description,
        }),
      ],
    };
  },
  component: AccountProfilePage,
});

function AccountProfilePage() {
  const { accountId } = Route.useLoaderData();
  const authClient = useAuthClient();
  const apiClient = useApiClient();

  const { data: profile } = useQuery({
    queryKey: ["near-profile", accountId],
    queryFn: async () => {
      const { data } = await authClient.near.getProfile(accountId);
      return data ?? null;
    },
    staleTime: 5 * 60 * 1000,
  });

  const { data: appsData } = useQuery({
    queryKey: ["apps-account", accountId],
    queryFn: () => apiClient.apps.getRegistryAppsByAccount({ accountId }),
    staleTime: 30_000,
  });

  const apps = appsData?.data ?? [];
  const backgroundUrl = resolveNearImageUrl(profile?.backgroundImage);
  const avatarUrl = resolveNearImageUrl(profile?.image);
  const displayName = profile?.name || accountId;
  const initials = getNearInitials(profile?.name || accountId);
  const linktree = profile?.linktree ? Object.entries(profile.linktree) : [];

  return (
    <PageContainer variant="default">
      <div className="space-y-6">
        <div className="overflow-hidden rounded-[12px] border border-border bg-card">
          <div
            className="h-32 sm:h-44 w-full bg-muted"
            style={
              backgroundUrl
                ? {
                    backgroundImage: `url(${backgroundUrl})`,
                    backgroundSize: "cover",
                    backgroundPosition: "center",
                  }
                : undefined
            }
          />
          <div className="px-6 pb-6">
            <Avatar className="-mt-10 size-20 border-4 border-card ring-1 ring-border bg-card">
              {avatarUrl ? <AvatarImage src={avatarUrl} alt="" /> : null}
              <AvatarFallback className="text-xl font-semibold">
                {initials || <User className="size-8" />}
              </AvatarFallback>
            </Avatar>

            <div className="mt-3 space-y-1">
              <h1 className="text-xl font-bold text-foreground">{displayName}</h1>
              <p className="font-mono text-sm text-muted-foreground">{accountId}</p>
            </div>

            {profile?.description && (
              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                {profile.description}
              </p>
            )}

            {linktree.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2">
                {linktree.map(([label, url]) => (
                  <a
                    key={label}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted px-3 py-1 text-xs font-medium text-foreground transition-colors hover:bg-border"
                  >
                    <Globe className="size-3" />
                    {label}
                  </a>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              Published Gateways
            </h2>
            {apps.length > 0 && (
              <Link
                to="/apps/$accountId"
                params={{ accountId }}
                className="text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                view all
              </Link>
            )}
          </div>

          {apps.length === 0 ? (
            <div className="rounded-[12px] border border-border bg-card px-6 py-10 text-center text-sm text-muted-foreground">
              No published gateways for{" "}
              <span className="font-mono text-foreground">{accountId}</span>.
            </div>
          ) : (
            <div className="divide-y divide-border overflow-hidden rounded-[12px] border border-border bg-card">
              {apps.slice(0, 5).map((app) => (
                <Link
                  key={app.gatewayId}
                  to="/apps/$accountId/$gatewayId"
                  params={{ accountId, gatewayId: app.gatewayId }}
                  className="flex items-center justify-between gap-4 px-4 py-3 transition-colors hover:bg-muted/40"
                >
                  <div className="min-w-0 space-y-0.5">
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${
                          app.status === "ready" ? "bg-green-500" : "bg-destructive"
                        }`}
                      />
                      <span className="truncate font-mono text-sm font-semibold text-foreground">
                        {app.metadata?.title ?? app.gatewayId}
                      </span>
                    </div>
                    {app.domain && (
                      <Badge variant="secondary" className="font-mono text-[10px]">
                        {app.domain}
                      </Badge>
                    )}
                  </div>
                  {app.openUrl && (
                    <ExternalLink className="size-3.5 shrink-0 text-muted-foreground" />
                  )}
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </PageContainer>
  );
}

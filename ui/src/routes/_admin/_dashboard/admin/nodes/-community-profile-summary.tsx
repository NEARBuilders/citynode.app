import { ArrowUpRightIcon, MapPinIcon } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useApiClient } from "@/app";
import { Avatar, AvatarFallback, Badge, Button, Skeleton } from "@/components";
import { discoveryProfileQueryOptions } from "@/components/discovery/profile-editor";
import { appErrorMessage } from "@/i18n/error-message";
import { useAppTranslation } from "@/i18n/runtime";

function initials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((word) => word[0]?.toUpperCase())
      .join("") || "?"
  );
}

export function CommunityProfileSummary({
  nodeId,
  name,
  hasSite,
}: {
  nodeId: string;
  name: string;
  hasSite: boolean;
}) {
  const translate = useAppTranslation();
  const api = useApiClient();
  const query = useQuery({ ...discoveryProfileQueryOptions(api, nodeId), enabled: hasSite });

  if (!hasSite)
    return (
      <section
        data-testid="admin-node-profile"
        className="flex items-center gap-4 rounded-2xl border border-border p-4 sm:p-6"
      >
        <Avatar className="size-14">
          <AvatarFallback className="text-lg">{initials(name)}</AvatarFallback>
        </Avatar>
        <p className="text-sm text-muted-foreground" data-testid="admin-node-profile-no-site">
          {translate("admin.community.noSiteProfile")}
        </p>
      </section>
    );

  if (query.isPending)
    return (
      <div className="flex items-start gap-4" aria-busy="true">
        <Skeleton className="size-14 rounded-full" />
        <div className="flex flex-1 flex-col gap-2">
          <Skeleton className="h-5 w-3/4" />
          <Skeleton className="h-4 w-1/3" />
        </div>
      </div>
    );

  if (query.isError && query.data === undefined)
    return (
      <div
        role="alert"
        data-testid="admin-node-profile-error"
        className="flex flex-wrap items-center gap-3 rounded-2xl border border-border p-4 text-sm"
      >
        <span className="text-destructive">
          {translate("community.loadProfileError")}: {appErrorMessage(query.error, translate)}
        </span>
        <Button variant="outline" size="sm" onClick={() => void query.refetch()}>
          {translate("common.retry")}
        </Button>
      </div>
    );

  const profile = query.data;
  const place = [profile?.location, profile?.region].filter(Boolean).join(" · ");

  return (
    <section
      data-testid="admin-node-profile"
      aria-label={translate("admin.community.publicProfile")}
      className="flex flex-col gap-4 rounded-2xl border border-border p-4 sm:flex-row sm:items-start sm:gap-5 sm:p-6"
    >
      <Avatar className="size-14">
        <AvatarFallback className="text-lg">{initials(name)}</AvatarFallback>
      </Avatar>
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge
            variant={profile?.published ? "success" : "outline"}
            data-testid="admin-node-profile-published"
          >
            {profile?.published
              ? translate("admin.community.onExplore")
              : translate("community.notOnExplore")}
          </Badge>
          {place ? (
            <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
              <MapPinIcon className="size-4" />
              {place}
            </span>
          ) : (
            <span className="text-sm text-muted-foreground">
              {translate("directory.noLocation")}
            </span>
          )}
        </div>
        <p
          data-testid="admin-node-profile-summary"
          className={
            profile?.summary
              ? "max-w-2xl text-base whitespace-pre-line text-foreground"
              : "text-sm text-muted-foreground"
          }
        >
          {profile?.summary || translate("admin.community.noPublicDescription")}
        </p>
        {profile && profile.channels.length > 0 && (
          <div className="-ml-2.5 flex flex-wrap gap-1" data-testid="admin-node-profile-links">
            {profile.channels.map((channel) => (
              <Button
                key={channel.url}
                variant="ghost"
                size="sm"
                nativeButton={false}
                render={(props) => (
                  <a {...props} href={channel.url} target="_blank" rel="noopener noreferrer" />
                )}
              >
                {channel.label}
                <ArrowUpRightIcon />
              </Button>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

import {
  ArrowUpRightIcon,
  CaretRightIcon,
  CloudSlashIcon,
  UsersThreeIcon,
} from "@phosphor-icons/react";
import { queryOptions, useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { type ApiClient, useApiClient, useAuthClient } from "@/app";
import { Avatar, AvatarFallback, AvatarImage, Button, SectionHeader } from "@/components";
import { Skeleton } from "@/components/ui/skeleton";
import { useAppTranslation } from "@/i18n/runtime";
import { getNearInitials, resolveNearImageUrl } from "@/lib/near-profile";

type CommunityBuilders = NonNullable<Awaited<ReturnType<ApiClient["getCommunityBuilders"]>>>;
type Builder = CommunityBuilders["builders"]["items"][number];
type Project = CommunityBuilders["projects"]["items"][number];

const cardClassName =
  "group flex h-full min-h-16 items-center gap-4 rounded-2xl border border-border bg-card p-4 outline-none transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50";

export function communityBuildersQueryOptions(apiClient: ApiClient, nodeId: string) {
  return queryOptions({
    queryKey: ["community-builders", nodeId],
    queryFn: () => apiClient.getCommunityBuilders({ nodeId }),
    enabled: !!nodeId,
    retry: false,
    staleTime: 60_000,
  });
}

export function NearbuildersSection({ nodeId, nodeName }: { nodeId: string; nodeName: string }) {
  const translate = useAppTranslation();
  const apiClient = useApiClient();
  const { data, isLoading, isError } = useQuery(communityBuildersQueryOptions(apiClient, nodeId));

  const unavailable = isError || data?.status === "unavailable";
  const builders = data?.builders.items ?? [];
  const projects = data?.projects.items ?? [];
  const joinUrl = `${data?.baseUrl ?? "https://nearbuilders.org"}/join`;

  return (
    <section className="flex flex-col gap-6" data-testid="node-page.nearbuilders">
      <SectionHeader
        title={translate("nearbuilders.title")}
        description={translate("nearbuilders.descriptionNamed", { name: nodeName })}
      />
      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Skeleton className="h-20 rounded-2xl" />
          <Skeleton className="h-20 rounded-2xl" />
          <Skeleton className="h-20 rounded-2xl" />
        </div>
      ) : unavailable || !data ? (
        <Notice icon={<CloudSlashIcon className="size-6 shrink-0 text-muted-foreground" />}>
          <p className="text-sm text-muted-foreground" data-testid="node-page.nearbuilders-error">
            {translate("nearbuilders.unavailable")}
          </p>
        </Notice>
      ) : builders.length === 0 && projects.length === 0 ? (
        <Notice icon={<UsersThreeIcon className="size-6 shrink-0 text-muted-foreground" />}>
          <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground" data-testid="node-page.nearbuilders-empty">
              {translate("nearbuilders.empty")}
            </p>
            <Button
              variant="outline"
              size="sm"
              nativeButton={false}
              render={(props) => (
                <a
                  {...props}
                  href={joinUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-testid="node-page.nearbuilders-join"
                />
              )}
            >
              {translate("nearbuilders.join")}
              <ArrowUpRightIcon />
            </Button>
          </div>
        </Notice>
      ) : (
        <div className="flex flex-col gap-8">
          <Group
            title={translate("nearbuilders.builders")}
            empty={translate("nearbuilders.noBuilders")}
            seeAllUrl={data.builders.total > builders.length ? data.builders.url : null}
            testId="node-page.nearbuilders-builders"
          >
            {builders.map((builder) => (
              <li key={builder.nearAccount}>
                <BuilderCard builder={builder} />
              </li>
            ))}
          </Group>
          <Group
            title={translate("nearbuilders.projects")}
            empty={translate("nearbuilders.noProjects")}
            seeAllUrl={data.projects.total > projects.length ? data.projects.url : null}
            testId="node-page.nearbuilders-projects"
          >
            {projects.map((project) => (
              <li key={project.url}>
                <ProjectCard project={project} />
              </li>
            ))}
          </Group>
        </div>
      )}
    </section>
  );
}

function Notice({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-center gap-4 rounded-2xl bg-muted p-6">
      {icon}
      {children}
    </div>
  );
}

function Group({
  title,
  empty,
  seeAllUrl,
  testId,
  children,
}: {
  title: string;
  empty: string;
  seeAllUrl: string | null;
  testId: string;
  children: ReactNode[];
}) {
  const translate = useAppTranslation();
  return (
    <div className="flex flex-col gap-3" data-testid={testId}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-base font-semibold text-foreground">{title}</h3>
        {seeAllUrl && (
          <a
            href={seeAllUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-sm font-medium text-foreground hover:underline"
          >
            {translate("nearbuilders.seeAll")}
            <ArrowUpRightIcon className="size-3.5" />
          </a>
        )}
      </div>
      {children.length > 0 ? (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{children}</ul>
      ) : (
        <p className="text-sm text-muted-foreground">{empty}</p>
      )}
    </div>
  );
}

function BuilderCard({ builder }: { builder: Builder }) {
  const authClient = useAuthClient();
  const { data: profile } = useQuery({
    queryKey: ["near-profile", builder.nearAccount],
    queryFn: async () => {
      const { data } = await authClient.near.getProfile(builder.nearAccount);
      return data ?? null;
    },
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
  const name = builder.name || profile?.name || builder.nearAccount;
  const avatarUrl = resolveNearImageUrl(profile?.image);

  return (
    <a href={builder.url} target="_blank" rel="noopener noreferrer" className={cardClassName}>
      <Avatar className="size-10 shrink-0">
        {avatarUrl ? <AvatarImage src={avatarUrl} alt="" /> : null}
        <AvatarFallback>{getNearInitials(name)}</AvatarFallback>
      </Avatar>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="truncate text-base font-medium text-foreground">{name}</div>
        <div className="truncate text-sm text-muted-foreground">{builder.nearAccount}</div>
      </div>
      <CaretRightIcon className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
    </a>
  );
}

function ProjectCard({ project }: { project: Project }) {
  return (
    <a href={project.url} target="_blank" rel="noopener noreferrer" className={cardClassName}>
      <Avatar className="size-10 shrink-0 rounded-xl after:rounded-xl">
        {project.logoUrl ? (
          <AvatarImage src={project.logoUrl} alt="" className="rounded-xl" />
        ) : null}
        <AvatarFallback className="rounded-xl">{getNearInitials(project.title)}</AvatarFallback>
      </Avatar>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="truncate text-base font-medium text-foreground">{project.title}</div>
        {project.description && (
          <p className="line-clamp-2 text-sm text-muted-foreground">{project.description}</p>
        )}
      </div>
      <CaretRightIcon className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
    </a>
  );
}

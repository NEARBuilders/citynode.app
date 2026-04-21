import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { toast } from "sonner";
import { authClient } from "@/app";
import { Badge, Button, Card, CardContent, UnderConstruction } from "@/components";
import { APP_NAME } from "@/lib/branding";
import {
  getActiveOrganization,
  isPersonalOrganization,
  organizationsQueryOptions,
  passkeysQueryOptions,
  sessionQueryOptions,
  setActiveOrganization,
} from "@/lib/session";
import { useApiClient } from "@/lib/use-api-client";

export const Route = createFileRoute("/_layout/_authenticated/home")({
  head: () => ({
    meta: [
      { title: `Workspace | ${APP_NAME}` },
      { name: "description", content: "Your workspace center." },
    ],
  }),
  component: Home,
});

function Home() {
  const queryClient = useQueryClient();
  const apiClient = useApiClient();

  type ProjectsResult = Awaited<ReturnType<typeof apiClient.projects.listProjects>>;

  const { data: session } = useQuery(sessionQueryOptions());
  const { data: organizations = [] } = useQuery(organizationsQueryOptions());
  const { data: passkeys = [] } = useQuery(passkeysQueryOptions());
  const user = session?.user;
  const { data: projectsData } = useQuery<ProjectsResult>({
    queryKey: ["projects"],
    queryFn: () => apiClient.projects.listProjects({ ownerId: user?.id, limit: 5 }),
  });

  const activeOrgId = session?.session?.activeOrganizationId;
  const nearAccountId = authClient.near.getAccountId();

  const activeOrg = useMemo(
    () => getActiveOrganization(organizations, activeOrgId),
    [organizations, activeOrgId],
  );

  const profile = useMemo(() => {
    if (!user) {
      return {
        isAnonymous: false,
        hasEmail: false,
        hasNear: false,
        hasPasskeys: false,
        isAdmin: false,
      };
    }

    return {
      isAnonymous: user.isAnonymous || false,
      hasEmail: Boolean(user.email),
      hasNear: Boolean(nearAccountId),
      hasPasskeys: passkeys.length > 0,
      isAdmin: user.role === "admin",
    };
  }, [user, nearAccountId, passkeys.length]);

  const switchOrgMutation = useMutation({
    mutationFn: (orgId: string) => setActiveOrganization(orgId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: sessionQueryOptions().queryKey,
      });
      toast.success("Switched organization");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to switch organization");
    },
  });

  if (!user) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-sm text-muted-foreground">
          Loading workspace...
        </CardContent>
      </Card>
    );
  }

  const capabilityCount = [profile.hasEmail, profile.hasNear, profile.hasPasskeys].filter(
    Boolean,
  ).length;

  return (
    <div className="space-y-8">
      <section className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <Card>
          <CardContent className="p-6 sm:p-8 space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">workspace</Badge>
              {profile.isAnonymous && <Badge variant="outline">anonymous</Badge>}
              {profile.isAdmin && <Badge variant="outline">admin</Badge>}
            </div>
            <div className="space-y-2">
              <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">
                {user.name || user.email || user.id.slice(0, 8)}
              </h1>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Manage identity, switch organizations, create API keys, and jump back into the
                published runtime browser.
              </p>
              <UnderConstruction
                label="home"
                sourceFile="ui/src/routes/_layout/_authenticated/home.tsx"
                className="w-full max-w-sm"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button asChild>
                <Link to="/settings">identity settings</Link>
              </Button>
              <Button asChild variant="outline">
                <Link to="/organizations">organizations</Link>
              </Button>
              <Button asChild variant="outline">
                <Link to="/apps" search={{}}>
                  published apps
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
            <StatBox label="organizations" value={String(organizations.length)} />
            <StatBox label="linked methods" value={String(capabilityCount)} />
            <StatBox label="passkeys" value={String(passkeys.length)} />
            <StatBox label="active org" value={activeOrg ? "yes" : "no"} />
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
        <Card>
          <CardContent className="p-6 space-y-4">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">
              identity status
            </div>
            <div className="grid gap-3">
              <InfoRow
                label="email"
                value={profile.hasEmail ? (user.email ?? "linked") : "not linked"}
              />
              <InfoRow
                label="near"
                value={profile.hasNear ? (nearAccountId ?? "linked") : "not linked"}
                mono
              />
              <InfoRow
                label="passkeys"
                value={profile.hasPasskeys ? `${passkeys.length} registered` : "not linked"}
              />
              <InfoRow
                label="profile"
                value={profile.isAnonymous ? "anonymous session" : "persistent account"}
              />
            </div>
            {profile.isAnonymous && (
              <div className="rounded-sm border border-border bg-muted/10 p-4 text-sm text-muted-foreground">
                Link an email or NEAR wallet before signing out so your progress stays attached to a
                durable identity.
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6 space-y-4">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">navigator</div>
            <div className="grid gap-3 sm:grid-cols-2">
              <WorkspaceTile
                title="organizations"
                body="members, invitations, switching, and team-level access"
                to="/organizations"
              />
              <WorkspaceTile
                title="settings"
                body="profile, linked auth methods, sessions, and sign out"
                to="/settings"
              />
              <WorkspaceTile
                title="developer access"
                body="test keys, API access, and protected endpoint workflows"
                to="/keys"
              />
              <WorkspaceTile
                title="published apps"
                body="return to the registry and inspect runtime records"
                href="/apps"
              />
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Active Organization</h2>
            <p className="text-sm text-muted-foreground">
              The current workspace target for organization-scoped actions.
            </p>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link to="/organizations/new">new org</Link>
          </Button>
        </div>

        {activeOrg ? (
          <Card>
            <CardContent className="p-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-4 min-w-0">
                {activeOrg.logo ? (
                  <img
                    src={activeOrg.logo}
                    alt=""
                    className="w-12 h-12 border-2 border-outset border-[rgb(51,51,51)] dark:border-[rgb(100,100,100)] object-cover"
                  />
                ) : (
                  <div className="w-12 h-12 border-2 border-outset border-[rgb(51,51,51)] dark:border-[rgb(100,100,100)] flex items-center justify-center text-lg">
                    {activeOrg.name.charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="font-medium break-all">{activeOrg.name}</div>
                    {isPersonalOrganization(activeOrg, user.id) && (
                      <Badge variant="outline">personal</Badge>
                    )}
                  </div>
                  <div className="text-xs font-mono text-muted-foreground">@{activeOrg.slug}</div>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button asChild size="sm">
                  <Link to="/organizations/$id" params={{ id: activeOrg.id }}>
                    open org
                  </Link>
                </Button>
                {organizations.length > 1 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const otherOrg = organizations.find((org) => org.id !== activeOrgId);
                      if (otherOrg) {
                        switchOrgMutation.mutate(otherOrg.id);
                      }
                    }}
                    disabled={switchOrgMutation.isPending}
                  >
                    {switchOrgMutation.isPending ? "switching..." : "switch org"}
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-5 space-y-3">
              <p className="text-sm text-muted-foreground">No active organization is selected.</p>
              <Button asChild variant="outline" size="sm">
                <Link to="/organizations">choose organization</Link>
              </Button>
            </CardContent>
          </Card>
        )}
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">My Projects</h2>
            <p className="text-sm text-muted-foreground">
              Projects you can access across your organizations.
            </p>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link to="/projects/new">new project</Link>
          </Button>
        </div>

        {projectsData && projectsData.data.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2">
            {projectsData.data.map((project: ProjectsResult["data"][number]) => (
              <Card key={project.id}>
                <CardContent className="p-5 space-y-3">
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge
                          variant={
                            project.status === "active"
                              ? "default"
                              : project.status === "paused"
                                ? "secondary"
                                : "destructive"
                          }
                        >
                          {project.status}
                        </Badge>
                        <Badge variant="outline">{project.visibility}</Badge>
                      </div>
                      <Link
                        to="/projects/$id"
                        params={{ id: project.id }}
                        className="font-medium hover:underline break-all"
                      >
                        {project.title}
                      </Link>
                      {project.description && (
                        <p className="text-xs text-muted-foreground line-clamp-2">
                          {project.description}
                        </p>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="p-5 space-y-3">
              <p className="text-sm text-muted-foreground">
                No projects yet. Create your first project to start organizing apps.
              </p>
              <Button asChild variant="outline" size="sm">
                <Link to="/projects/new">create project</Link>
              </Button>
            </CardContent>
          </Card>
        )}
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Quick Actions</h2>
          <p className="text-sm text-muted-foreground">Shortcuts for the most common next steps.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm">
            <Link to="/organizations/new">create org</Link>
          </Button>
          {activeOrgId ? (
            <Button asChild variant="outline" size="sm">
              <Link to="/organizations/$id" params={{ id: activeOrgId }}>
                invite member
              </Link>
            </Button>
          ) : (
            <Button variant="outline" size="sm" disabled>
              invite member
            </Button>
          )}
          <Button asChild variant="outline" size="sm">
            <Link to="/settings">add passkey</Link>
          </Button>
          {!profile.hasNear && (
            <Button asChild variant="outline" size="sm">
              <Link to="/settings">link NEAR</Link>
            </Button>
          )}
          <Button asChild variant="outline" size="sm">
            <Link to="/apps" search={{}}>
              open registry
            </Link>
          </Button>
        </div>
      </section>
    </div>
  );
}

function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-sm border border-border bg-muted/10 p-3 space-y-1">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-2xl font-semibold tracking-tight">{value}</div>
    </div>
  );
}

function InfoRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-sm border border-border bg-muted/10 p-3 grid gap-1 sm:grid-cols-[100px_1fr] sm:gap-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={mono ? "text-xs font-mono break-all" : "text-sm break-all"}>{value}</div>
    </div>
  );
}

function WorkspaceTile({
  title,
  body,
  to,
  href,
}: {
  title: string;
  body: string;
  to?: "/organizations" | "/settings" | "/keys";
  href?: string;
}) {
  const tile = (
    <Card className="transition-colors hover:bg-muted/20">
      <CardContent className="p-4 space-y-2">
        <div className="font-medium">{title}</div>
        <p className="text-sm text-muted-foreground leading-relaxed">{body}</p>
      </CardContent>
    </Card>
  );

  if (to) {
    return <Link to={to}>{tile}</Link>;
  }

  return <a href={href}>{tile}</a>;
}

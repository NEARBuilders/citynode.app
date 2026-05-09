import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ExternalLink, Link as LinkIcon, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import remarkGfm from "remark-gfm";
import { toast } from "sonner";
import { type ClientRuntimeConfig, getAuthClient, type SessionData } from "@/app";
import { Badge, Button, Card, CardContent, Input } from "@/components";
import { useApiClient } from "@/lib/use-api-client";

function rawReadmeUrl(repoUrl: string): string | null {
  try {
    const url = new URL(repoUrl);
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts.length < 2) return null;
    const [owner, repo] = parts;
    return `https://raw.githubusercontent.com/${owner}/${repo}/main/README.md`;
  } catch {
    return null;
  }
}

export const Route = createFileRoute("/_layout/_authenticated/projects/$id")({
  head: ({ params }) => ({
    meta: [
      { title: `${params.id} | Project | app` },
      { name: "description", content: "Project details and README." },
    ],
  }),
  loader: async ({ params }) => {
    return { projectId: params.id };
  },
  component: ProjectDetailPage,
});

function ProjectDetailPage() {
  const { id: projectId } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const apiClient = useApiClient();
  const { runtimeConfig } = Route.useRouteContext() as {
    runtimeConfig?: Partial<ClientRuntimeConfig>;
  };

  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editRepository, setEditRepository] = useState("");
  const [editVisibility, setEditVisibility] = useState<"private" | "unlisted" | "public">(
    "private",
  );
  const [editStatus, setEditStatus] = useState<"active" | "paused" | "archived">("active");

  const { data: session } = useQuery<SessionData | null>({
    queryKey: ["session"],
    queryFn: async () => {
      const { data } = await getAuthClient(runtimeConfig).getSession();
      return data ?? null;
    },
    staleTime: 60 * 1000,
  });

  const projectQuery = useQuery({
    queryKey: ["project", projectId],
    queryFn: () => apiClient.projects.getProject({ id: projectId }),
  });

  const readmeQuery = useQuery({
    queryKey: ["readme", projectQuery.data?.data?.repository],
    queryFn: async () => {
      const repo = projectQuery.data?.data?.repository;
      if (!repo) return null;
      const url = rawReadmeUrl(repo);
      if (!url) return null;
      const res = await fetch(url);
      if (!res.ok) return null;
      let text = await res.text();
      text = text
        .replace(/<!-- markdownlint-disable[^>]*-->/g, "")
        .replace(/<div align="center">[\s\S]*?<\/div>/g, "")
        .trim();
      return text;
    },
    enabled: !!projectQuery.data?.data?.repository,
  });

  const updateMutation = useMutation({
    mutationFn: () =>
      apiClient.projects.updateProject({
        id: projectId,
        title: editTitle.trim(),
        description: editDescription.trim() || undefined,
        repository: editRepository.trim() || undefined,
        visibility: editVisibility,
        status: editStatus,
      }),
    onSuccess: () => {
      toast.success("Project updated");
      setIsEditing(false);
      queryClient.invalidateQueries({ queryKey: ["project", projectId] });
      queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to update project");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => apiClient.projects.deleteProject({ id: projectId }),
    onSuccess: () => {
      toast.success("Project deleted");
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      navigate({ to: "/projects" });
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to delete project");
    },
  });

  const startEditing = () => {
    const p = projectQuery.data?.data;
    if (!p) return;
    setEditTitle(p.title);
    setEditDescription(p.description ?? "");
    setEditRepository(p.repository ?? "");
    setEditVisibility(p.visibility);
    setEditStatus(p.status);
    setIsEditing(true);
  };

  if (projectQuery.isLoading) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-sm text-muted-foreground">
          Loading project...
        </CardContent>
      </Card>
    );
  }

  if (projectQuery.isError || !projectQuery.data?.data) {
    return (
      <Card>
        <CardContent className="p-8 text-center space-y-3">
          <p className="text-sm">Project not found or you don't have access.</p>
          <Button asChild variant="outline" size="sm">
            <a href="/projects">back to projects</a>
          </Button>
        </CardContent>
      </Card>
    );
  }

  const project = projectQuery.data.data;
  const walletAddress = (session?.user as { walletAddress?: string | null } | null | undefined)
    ?.walletAddress;
  const isOwner = (walletAddress ?? session?.user?.id) === project.ownerId;

  return (
    <div className="space-y-8">
      {/* Breadcrumb + actions */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2 text-xs font-mono text-muted-foreground">
            <Link to="/projects" className="hover:text-foreground transition-colors">
              projects
            </Link>
            <span>/</span>
            <span>{project.slug}</span>
          </div>
          {isOwner && !isEditing && (
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={startEditing}>
                <Pencil className="h-3.5 w-3.5 mr-1" />
                edit
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="text-destructive hover:bg-destructive/10"
                onClick={() => {
                  if (confirm("Delete this project permanently?")) {
                    deleteMutation.mutate();
                  }
                }}
                disabled={deleteMutation.isPending}
              >
                <Trash2 className="h-3.5 w-3.5 mr-1" />
                delete
              </Button>
            </div>
          )}
        </div>

        {/* Header Card */}
        <Card>
          <CardContent className="p-6 space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">project</Badge>
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
              <Badge
                variant={
                  project.visibility === "public"
                    ? "default"
                    : project.visibility === "unlisted"
                      ? "secondary"
                      : "outline"
                }
              >
                {project.visibility}
              </Badge>
            </div>

            {isEditing ? (
              <div className="space-y-4">
                <div className="space-y-2">
                  <label
                    htmlFor="edit-title"
                    className="text-xs uppercase tracking-wide text-muted-foreground"
                  >
                    Title
                  </label>
                  <Input
                    id="edit-title"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <label
                    htmlFor="edit-description"
                    className="text-xs uppercase tracking-wide text-muted-foreground"
                  >
                    Description
                  </label>
                  <textarea
                    id="edit-description"
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                    rows={3}
                    className="flex min-h-[80px] w-full rounded-md border-2 border-inset border-[rgb(51,51,51)] bg-[rgb(255,255,255)] px-3 py-2 text-sm shadow-xs outline-none transition-[color,box-shadow] placeholder:text-muted-foreground focus:ring-2 focus:ring-ring dark:bg-[rgb(40,40,40)] dark:border-[rgb(100,100,100)]"
                  />
                </div>
                <div className="space-y-2">
                  <label
                    htmlFor="edit-repository"
                    className="text-xs uppercase tracking-wide text-muted-foreground"
                  >
                    Repository
                  </label>
                  <Input
                    id="edit-repository"
                    type="url"
                    value={editRepository}
                    onChange={(e) => setEditRepository(e.target.value)}
                    placeholder="https://github.com/user/repo"
                    className="font-mono text-sm"
                  />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <label
                      htmlFor="edit-visibility"
                      className="text-xs uppercase tracking-wide text-muted-foreground"
                    >
                      Visibility
                    </label>
                    <select
                      id="edit-visibility"
                      value={editVisibility}
                      onChange={(e) =>
                        setEditVisibility(e.target.value as "private" | "unlisted" | "public")
                      }
                      className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm"
                    >
                      <option value="private">Private</option>
                      <option value="unlisted">Unlisted</option>
                      <option value="public">Public</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label
                      htmlFor="edit-status"
                      className="text-xs uppercase tracking-wide text-muted-foreground"
                    >
                      Status
                    </label>
                    <select
                      id="edit-status"
                      value={editStatus}
                      onChange={(e) =>
                        setEditStatus(e.target.value as "active" | "paused" | "archived")
                      }
                      className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm"
                    >
                      <option value="active">Active</option>
                      <option value="paused">Paused</option>
                      <option value="archived">Archived</option>
                    </select>
                  </div>
                </div>
                <div className="flex gap-3">
                  <Button
                    onClick={() => updateMutation.mutate()}
                    disabled={updateMutation.isPending}
                  >
                    {updateMutation.isPending ? "saving..." : "save"}
                  </Button>
                  <Button variant="outline" onClick={() => setIsEditing(false)}>
                    cancel
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">
                  {project.title}
                </h1>
                {project.description && (
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {project.description}
                  </p>
                )}
                {project.repository && (
                  <div className="pt-1">
                    <a
                      href={project.repository}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
                    >
                      <LinkIcon className="h-4 w-4" />
                      {project.repository.replace(/^https:\/\//, "")}
                    </a>
                  </div>
                )}
              </div>
            )}

            <div className="grid gap-3 text-xs font-mono text-muted-foreground">
              <div className="grid gap-1 sm:grid-cols-[140px_1fr] sm:gap-4">
                <span className="uppercase tracking-wide flex items-center gap-1.5">
                  <LinkIcon className="h-3 w-3" />
                  slug
                </span>
                <span className="break-all">{project.slug}</span>
              </div>
              <div className="grid gap-1 sm:grid-cols-[140px_1fr] sm:gap-4">
                <span className="uppercase tracking-wide flex items-center gap-1.5">
                  <ExternalLink className="h-3 w-3" />
                  owner
                </span>
                <span className="break-all">{project.ownerId}</span>
              </div>
              {project.organizationId && (
                <div className="grid gap-1 sm:grid-cols-[140px_1fr] sm:gap-4">
                  <span className="uppercase tracking-wide">organization</span>
                  <a
                    href={`/organizations/${project.organizationId}`}
                    className="hover:text-foreground transition-colors"
                  >
                    {project.organizationId}
                  </a>
                </div>
              )}
              <div className="grid gap-1 sm:grid-cols-[140px_1fr] sm:gap-4">
                <span className="uppercase tracking-wide">created</span>
                <span>{new Date(project.createdAt).toLocaleString()}</span>
              </div>
              <div className="grid gap-1 sm:grid-cols-[140px_1fr] sm:gap-4">
                <span className="uppercase tracking-wide">updated</span>
                <span>{new Date(project.updatedAt).toLocaleString()}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* README */}
      {project.repository && (
        <section className="space-y-4">
          <h2 className="text-lg font-semibold tracking-tight">README</h2>
          <Card>
            <CardContent className="p-6">
              {readmeQuery.isLoading ? (
                <div className="text-sm text-muted-foreground">Loading README...</div>
              ) : readmeQuery.isError || !readmeQuery.data ? (
                <div className="text-sm text-muted-foreground">
                  Could not load README. Check the repository URL.
                </div>
              ) : (
                <div className="prose prose-neutral dark:prose-invert max-w-full text-sm">
                  <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
                    {readmeQuery.data || "Documentation content is currently unavailable."}
                  </ReactMarkdown>
                </div>
              )}
            </CardContent>
          </Card>
        </section>
      )}
    </div>
  );
}

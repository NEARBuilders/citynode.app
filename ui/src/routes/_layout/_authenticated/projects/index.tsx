import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Reorder } from "framer-motion";
import { ChevronDown, Eye, Globe, Lock, Plus, TrendingDown, TrendingUp } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { toast } from "sonner";
import { type SessionData, useAuthClient } from "@/app";
import { Badge, Button } from "@/components";
import { useApiClient } from "@/app";

interface VoteEvent {
  type: "upvote" | "downvote";
  thingId: string;
  userId: string;
  timestamp: string;
  totalCount: number;
}

interface RankedProject {
  id: string;
  ownerId: string;
  organizationId: string | null;
  slug: string;
  title: string;
  description: string | null;
  status: "active" | "paused" | "archived";
  visibility: "private" | "unlisted" | "public";
  createdAt: string;
  updatedAt: string;
  upvoteCount: number;
}

const PAGE_SIZE = 24;

export const Route = createFileRoute("/_layout/_authenticated/projects/")({
  head: () => ({
    meta: [
      { title: "Projects | app" },
      { name: "description", content: "Ranked projects with live upvotes." },
    ],
  }),
  component: ProjectsList,
});

function ProjectsList() {
  const apiClient = useApiClient();
  const auth = useAuthClient();
  const queryClient = useQueryClient();
  const observerRef = useRef<IntersectionObserver | null>(null);

  const { data: session } = useQuery<SessionData | null>({
    queryKey: ["session"],
    queryFn: async () => {
      const { data } = await auth.getSession();
      return data ?? null;
    },
    staleTime: 60 * 1000,
  });

  const user = session?.user;

  const {
    data: pages,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ["projects"],
    queryFn: ({ pageParam }) =>
      apiClient.projects.listProjects({
        limit: PAGE_SIZE,
        cursor: pageParam,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => (lastPage.meta.hasMore ? lastPage.meta.nextCursor : undefined),
    enabled: !!user,
  });

  const projects = useMemo(() => pages?.pages.flatMap((p) => p.data) ?? [], [pages]);

  const upvoteCounts = useQuery({
    queryKey: ["upvoteCounts", projects.map((p) => p.id)],
    queryFn: async () => {
      const counts: Record<string, number> = {};
      await Promise.all(
        projects.map(async (project) => {
          try {
            const result = await apiClient.getUpvoteCount({ thingId: project.id });
            counts[project.id] = result.totalCount ?? 0;
          } catch {
            counts[project.id] = 0;
          }
        }),
      );
      return counts;
    },
    enabled: projects.length > 0,
  });

  const counts = upvoteCounts.data ?? {};

  const rankedProjects = useMemo<RankedProject[]>(() => {
    return projects
      .map((p) => ({
        ...p,
        upvoteCount: counts[p.id] ?? 0,
      }))
      .sort((a, b) => b.upvoteCount - a.upvoteCount);
  }, [projects, counts]);

  const projectIds = useMemo(() => rankedProjects.map((p) => p.id), [rankedProjects]);

  const upvoteMutation = useMutation({
    mutationFn: (thingId: string) => apiClient.upvoteThing({ thingId }),
    onSuccess: (data) => {
      queryClient.setQueryData(
        ["upvoteCounts", projects.map((p) => p.id)],
        (old: Record<string, number> | undefined) => ({
          ...old,
          [data.thingId]: data.totalCount,
        }),
      );
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to upvote");
    },
  });

  const downvoteMutation = useMutation({
    mutationFn: (thingId: string) => apiClient.downvoteThing({ thingId }),
    onSuccess: (data) => {
      queryClient.setQueryData(
        ["upvoteCounts", projects.map((p) => p.id)],
        (old: Record<string, number> | undefined) => ({
          ...old,
          [data.thingId]: data.totalCount,
        }),
      );
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to downvote");
    },
  });

  useEffect(() => {
    const es = new EventSource("/api/upvotes/stream");

    es.addEventListener("connected", () => {
      console.log("[SSE] Upvote stream connected");
    });

    es.addEventListener("vote", (e) => {
      try {
        const event = JSON.parse(e.data) as VoteEvent;
        queryClient.setQueryData(
          ["upvoteCounts", projects.map((p) => p.id)],
          (old: Record<string, number> | undefined) => ({
            ...old,
            [event.thingId]: event.totalCount,
          }),
        );
      } catch {
        // ignore parse errors
      }
    });

    es.addEventListener("error", () => {
      console.log("[SSE] Upvote stream error");
    });

    return () => {
      es.close();
    };
  }, [queryClient, projects]);

  const sentinelRef = useCallback(
    (node: HTMLDivElement | null) => {
      if (observerRef.current) observerRef.current.disconnect();
      if (!node || !hasNextPage || isFetchingNextPage) return;

      observerRef.current = new IntersectionObserver((entries) => {
        if (entries[0]?.isIntersecting) {
          fetchNextPage();
        }
      });

      observerRef.current.observe(node);
    },
    [fetchNextPage, hasNextPage, isFetchingNextPage],
  );

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-24 border border-border bg-muted/10 animate-pulse rounded-lg" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Projects</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Ranked by upvotes. Vote to reshuffle the leaderboard in real time.
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link to="/projects/new">
            <Plus className="h-3.5 w-3.5 mr-1" />
            New Project
          </Link>
        </Button>
      </div>

      {rankedProjects.length === 0 ? (
        <div className="border border-border bg-muted/10 p-12 text-center rounded-lg">
          <p className="text-sm text-muted-foreground">No projects yet.</p>
        </div>
      ) : (
        <>
          <Reorder.Group
            as="div"
            axis="y"
            values={projectIds}
            onReorder={() => {}}
            className="flex flex-col gap-3"
          >
            {rankedProjects.map((project, index) => (
              <Reorder.Item
                as="div"
                key={project.id}
                value={project.id}
                layout="position"
                drag={false}
                dragListener={false}
                transition={{
                  layout: { type: "spring", stiffness: 300, damping: 30 },
                }}
              >
                <ProjectCard
                  rank={index + 1}
                  project={project}
                  upvoteCount={project.upvoteCount}
                  isUpvoting={upvoteMutation.isPending && upvoteMutation.variables === project.id}
                  isDownvoting={
                    downvoteMutation.isPending && downvoteMutation.variables === project.id
                  }
                  onUpvote={() => upvoteMutation.mutate(project.id)}
                  onDownvote={() => downvoteMutation.mutate(project.id)}
                />
              </Reorder.Item>
            ))}
          </Reorder.Group>

          <div ref={sentinelRef} className="flex justify-center py-4">
            {isFetchingNextPage && (
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
            )}
            {hasNextPage && !isFetchingNextPage && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => fetchNextPage()}
                className="text-muted-foreground"
              >
                <ChevronDown className="h-4 w-4 mr-1" />
                Load more
              </Button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function ProjectCard({
  rank,
  project,
  upvoteCount,
  isUpvoting,
  isDownvoting,
  onUpvote,
  onDownvote,
}: {
  rank: number;
  project: RankedProject;
  upvoteCount: number;
  isUpvoting: boolean;
  isDownvoting: boolean;
  onUpvote: () => void;
  onDownvote: () => void;
}) {
  return (
    <div className="flex items-center gap-4 rounded-lg border border-border bg-card p-4 pr-5 hover:bg-accent/30 transition-colors">
      <div className="flex flex-col items-center justify-center w-10 shrink-0">
        <span className="text-lg font-bold tabular-nums text-muted-foreground">#{rank}</span>
      </div>

      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge
            variant={
              project.status === "active"
                ? "default"
                : project.status === "paused"
                  ? "secondary"
                  : "destructive"
            }
            className="text-[10px]"
          >
            {project.status}
          </Badge>
          <Badge variant="outline" className="text-[10px] flex items-center gap-1">
            {project.visibility === "public" ? (
              <Globe className="h-2.5 w-2.5" />
            ) : project.visibility === "unlisted" ? (
              <Eye className="h-2.5 w-2.5" />
            ) : (
              <Lock className="h-2.5 w-2.5" />
            )}
            {project.visibility}
          </Badge>
        </div>
        <Link
          to="/projects/$id"
          params={{ id: project.id }}
          className="block font-semibold text-foreground hover:underline truncate"
        >
          {project.title}
        </Link>
        {project.description && (
          <p className="text-sm text-muted-foreground truncate">{project.description}</p>
        )}
      </div>

      <div className="flex flex-col items-center gap-0.5 shrink-0">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 rounded-full"
          onClick={onUpvote}
          disabled={isUpvoting}
        >
          <TrendingUp className="h-4 w-4" />
        </Button>
        <span className="text-sm font-bold tabular-nums text-foreground leading-none py-0.5">
          {upvoteCount}
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 rounded-full"
          onClick={onDownvote}
          disabled={isDownvoting}
        >
          <TrendingDown className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

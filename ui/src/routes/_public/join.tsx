import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { pluginHref, sessionQueryOptions, useApiClient, useAuthClient } from "@/app";
import { PageContainer } from "@/components/layout/page-container";

export const Route = createFileRoute("/_public/join")({
  validateSearch: z.object({
    place: z.string().min(1).max(120).catch(""),
  }),
  component: Join,
});

function Join() {
  const api = useApiClient();
  const auth = useAuthClient();
  const search = Route.useSearch();
  const navigate = useNavigate();
  const sessionQuery = useQuery(sessionQueryOptions(auth));
  const [error, setError] = useState<string | null>(null);

  const session = sessionQuery.data;

  const place = search.place;

  useEffect(() => {
    if (sessionQuery.isPending) return;
    if (!place) {
      navigate({ to: "/explore" });
      return;
    }
    if (!session) {
      window.location.assign(
        pluginHref("/login", { redirect: `/join?place=${encodeURIComponent(place)}` }),
      );
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const activation = await api.activateCommunity({ place });
        await api.joinCommunity({ placeId: activation.placeId });
        if (cancelled) return;
        navigate({ to: "/n/$slug", params: { slug: activation.slug } });
      } catch (joinError) {
        if (!cancelled) {
          setError(
            joinError instanceof Error ? joinError.message : "Could not join this community",
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionQuery.isPending, session, place, api, navigate]);

  return (
    <PageContainer>
      <div className="flex flex-col items-center gap-4 py-16 text-center">
        <h1 className="text-2xl font-semibold">{place ? `Join ${place}` : "Join a community"}</h1>
        {error ? (
          <p className="text-destructive">{error}</p>
        ) : sessionQuery.isPending ? (
          <p className="text-muted-foreground">Checking your session…</p>
        ) : (
          <p className="text-muted-foreground">Setting up your membership…</p>
        )}
      </div>
    </PageContainer>
  );
}

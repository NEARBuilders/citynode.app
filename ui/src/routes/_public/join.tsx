import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate, useRouter } from "@tanstack/react-router";
import { useEffect } from "react";
import { z } from "zod";
import { pluginHref, sessionQueryOptions, useApiClient, useAuthClient } from "@/app";
import { Button } from "@/components";
import { PageContainer } from "@/components/layout/page-container";
import type { AppMessageId } from "@/i18n/catalogs";
import { isConflictError, isNotFoundError, isSessionError } from "@/i18n/error-message";
import { useAppTranslation } from "@/i18n/runtime";
import { joinReturnPath } from "@/lib/join-sign-in";
import { joinCommunityQueryOptions } from "@/lib/queries/join-community";
import { placeResolutionQueryOptions } from "@/lib/queries/places";

export const Route = createFileRoute("/_public/join")({
  validateSearch: z.object({
    place: z.string().min(1).max(120).catch(""),
  }),
  component: Join,
});

function joinFailureMessage(error: unknown): AppMessageId {
  if (isSessionError(error)) return "error.session";
  if (isNotFoundError(error)) return "join.notFound";
  if (isConflictError(error)) return "join.unavailable";
  return "join.failed";
}

function Join() {
  const translate = useAppTranslation();
  const api = useApiClient();
  const auth = useAuthClient();
  const { place } = Route.useSearch();
  const navigate = useNavigate();
  const router = useRouter();
  const queryClient = useQueryClient();
  const sessionQuery = useQuery(sessionQueryOptions(auth));
  const userId = sessionQuery.data?.user.id;
  const signedOut =
    !sessionQuery.isPending && !sessionQuery.isFetching && !sessionQuery.isError && !userId;
  const resolved = useQuery(placeResolutionQueryOptions(api, place));
  const join = useQuery(
    joinCommunityQueryOptions({ api, auth, queryClient, router }, place, userId),
  );
  const slug = join.data;

  useEffect(() => {
    if (!place) {
      void navigate({ to: "/explore", replace: true });
      return;
    }
    if (signedOut) {
      window.location.replace(pluginHref("/login", { redirect: joinReturnPath(place) }));
    }
  }, [place, signedOut, navigate]);

  useEffect(() => {
    if (slug) void navigate({ to: "/n/$slug", params: { slug }, replace: true });
  }, [slug, navigate]);

  const name = resolved.data?.place.name;
  const community = resolved.data?.community;
  const error = userId ? join.error : sessionQuery.error;
  const failed = !!error && !(userId ? join.isFetching : sessionQuery.isFetching);

  const retry = async () => {
    const session = await sessionQuery.refetch();
    if (userId && session.data?.user.id === userId) {
      await join.refetch({ cancelRefetch: false });
    }
  };

  return (
    <PageContainer>
      <div className="flex flex-col items-center gap-4 py-16 text-center">
        <h1 className="text-2xl font-semibold wrap-anywhere">
          {name ? translate("community.join", { name }) : translate("join.title")}
        </h1>
        {failed ? (
          <>
            <p role="alert" className="max-w-md text-destructive" data-testid="join.error">
              {translate(joinFailureMessage(error))}
            </p>
            <div className="flex flex-col gap-3 sm:flex-row">
              {!isNotFoundError(error) && (
                <Button onClick={() => void retry()} data-testid="join.retry">
                  {translate("common.retry")}
                </Button>
              )}
              <Button
                variant="outline"
                nativeButton={false}
                render={
                  community ? (
                    <Link to="/n/$slug" params={{ slug: community.slug }} data-testid="join.back" />
                  ) : (
                    <Link to="/explore" data-testid="join.back" />
                  )
                }
              >
                {community && name
                  ? translate("join.backToCommunity", { name })
                  : translate("community.backExplore")}
              </Button>
            </div>
          </>
        ) : (
          <p role="status" className="text-muted-foreground">
            {userId ? translate("join.settingUp") : translate("join.checkingSession")}
          </p>
        )}
      </div>
    </PageContainer>
  );
}

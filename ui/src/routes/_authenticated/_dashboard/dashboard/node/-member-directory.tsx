import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useEffect, useId, useRef } from "react";
import { useApiClient } from "@/app";
import { Button, SectionHeader } from "@/components";
import { MemberCountValue } from "@/components/member-count";
import { Switch } from "@/components/ui/switch";
import { useAppTranslation } from "@/i18n/runtime";
import {
  memberDirectoryChannelName,
  memberDirectoryOptInQueryOptions,
  memberDirectoryQueryKeys,
  memberDirectoryQueryOptions,
  nodeMemberCountQueryOptions,
} from "@/lib/queries/member-directory";

export function MemberDirectory({
  organizationId,
  nodeId,
}: {
  organizationId: string;
  nodeId: string;
}) {
  const translate = useAppTranslation();
  const apiClient = useApiClient();
  const queryClient = useQueryClient();
  const switchId = useId();
  const hintId = useId();
  const optIn = useQuery(memberDirectoryOptInQueryOptions(apiClient));
  const directory = useInfiniteQuery(memberDirectoryQueryOptions(apiClient, organizationId));
  const loadFailed = directory.isError && !directory.isFetchNextPageError;
  const firstPage = loadFailed ? undefined : directory.data?.pages[0];
  const members = loadFailed ? [] : (directory.data?.pages.flatMap((page) => page.members) ?? []);
  const cachedCount = useQuery({
    ...nodeMemberCountQueryOptions(apiClient, nodeId),
    enabled: loadFailed,
  });
  const channel = useRef<BroadcastChannel | null>(null);
  const setOptIn = useMutation({
    mutationFn: (optedIn: boolean) => apiClient.setMemberDirectoryOptIn({ optedIn }),
    onSuccess: async (result) => {
      queryClient.setQueryData(memberDirectoryQueryKeys.optIn(), result);
      channel.current?.postMessage("changed");
      await queryClient.invalidateQueries({ queryKey: memberDirectoryQueryKeys.all });
    },
  });
  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;
    const views = new BroadcastChannel(memberDirectoryChannelName);
    views.onmessage = () => {
      void queryClient.invalidateQueries({ queryKey: memberDirectoryQueryKeys.all });
    };
    channel.current = views;
    return () => {
      channel.current = null;
      views.close();
    };
  }, [queryClient]);
  const checked = setOptIn.isPending
    ? (setOptIn.variables ?? false)
    : (optIn.data?.optedIn ?? false);

  return (
    <section className="flex min-w-0 flex-col gap-6" data-testid="dashboard-node.members">
      <SectionHeader title={translate("members.title")} />
      <div
        className="text-3xl font-semibold tabular-nums"
        data-testid="dashboard-node.member-count"
      >
        {firstPage ? (
          <span data-testid="dashboard-node.member-count-value">{firstPage.count}</span>
        ) : loadFailed ? (
          <MemberCountValue
            count={cachedCount.data?.count}
            observedAt={cachedCount.data?.observedAt}
            testId="dashboard-node.member-count"
          />
        ) : (
          "—"
        )}
      </div>
      <div className="flex items-start justify-between gap-4 rounded-2xl border border-border p-4">
        <div className="flex min-w-0 flex-col gap-1">
          <label htmlFor={switchId} className="text-sm font-medium">
            {translate("members.showMyName")}
          </label>
          <p id={hintId} className="text-sm text-muted-foreground">
            {translate("members.showMyNameHint")}
          </p>
        </div>
        <Switch
          id={switchId}
          checked={checked}
          disabled={!optIn.isSuccess || setOptIn.isPending}
          onCheckedChange={(next) => setOptIn.mutate(next)}
          aria-describedby={hintId}
          data-testid="dashboard-node.member-opt-in"
        />
      </div>
      {optIn.isError && (
        <div
          className="flex flex-wrap items-center gap-2 text-sm text-destructive"
          role="alert"
          data-testid="dashboard-node.member-opt-in-load-error"
        >
          <span>{translate("members.optInLoadFailed")}</span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void optIn.refetch()}
            data-testid="dashboard-node.member-opt-in-retry"
          >
            {translate("common.retry")}
          </Button>
        </div>
      )}
      {setOptIn.isError && (
        <p
          className="text-sm text-destructive"
          role="alert"
          data-testid="dashboard-node.member-opt-in-error"
        >
          {translate("members.optInFailed")}
        </p>
      )}
      {loadFailed ? (
        <p className="text-sm text-muted-foreground" data-testid="dashboard-node.members-error">
          {translate("members.loadFailed")}
        </p>
      ) : firstPage && members.length === 0 && !directory.hasNextPage ? (
        <p className="text-sm text-muted-foreground" data-testid="dashboard-node.members-empty">
          {translate("members.noneShared")}
        </p>
      ) : members.length > 0 ? (
        <ul className="flex min-w-0 flex-col gap-2" data-testid="dashboard-node.member-list">
          {members.map((member) => {
            const name = member.name ?? translate("members.unnamed");
            return (
              <li
                key={member.userId}
                className="min-w-0 break-words text-sm"
                data-testid="dashboard-node.member"
              >
                {member.accountId ? (
                  <Link
                    to="/$accountId"
                    params={{ accountId: member.accountId }}
                    className="font-medium underline-offset-4 hover:underline"
                  >
                    {name}
                  </Link>
                ) : (
                  <span className={member.name ? "font-medium" : "text-muted-foreground"}>
                    {name}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      ) : null}
      {!loadFailed && directory.hasNextPage && (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={directory.isFetchingNextPage}
            onClick={() => void directory.fetchNextPage()}
            data-testid="dashboard-node.members-load-more"
          >
            {translate("common.loadMore")}
          </Button>
          {directory.isFetchNextPageError && (
            <span
              className="text-sm text-destructive"
              role="alert"
              data-testid="dashboard-node.members-load-more-error"
            >
              {translate("members.loadMoreFailed")}
            </span>
          )}
        </div>
      )}
    </section>
  );
}

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useEffect, useId } from "react";
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
  const directory = useQuery(memberDirectoryQueryOptions(apiClient, organizationId));
  const cachedCount = useQuery({
    ...nodeMemberCountQueryOptions(apiClient, nodeId),
    enabled: directory.isError,
  });
  const setOptIn = useMutation({
    mutationFn: (optedIn: boolean) => apiClient.setMemberDirectoryOptIn({ optedIn }),
    onSuccess: async (result) => {
      queryClient.setQueryData(memberDirectoryQueryKeys.optIn(), result);
      notifyOtherViews();
      await queryClient.invalidateQueries({ queryKey: memberDirectoryQueryKeys.all });
    },
  });
  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;
    const channel = new BroadcastChannel(memberDirectoryChannelName);
    channel.onmessage = () => {
      void queryClient.invalidateQueries({ queryKey: memberDirectoryQueryKeys.all });
    };
    return () => channel.close();
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
        {directory.data ? (
          <span data-testid="dashboard-node.member-count-value">{directory.data.count}</span>
        ) : directory.isError ? (
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
      {directory.isError ? (
        <p className="text-sm text-muted-foreground" data-testid="dashboard-node.members-error">
          {translate("members.loadFailed")}
        </p>
      ) : directory.data && directory.data.members.length === 0 ? (
        <p className="text-sm text-muted-foreground" data-testid="dashboard-node.members-empty">
          {translate("members.noneShared")}
        </p>
      ) : directory.data ? (
        <ul className="flex min-w-0 flex-col gap-2" data-testid="dashboard-node.member-list">
          {directory.data.members.map((member) => {
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
    </section>
  );
}

function notifyOtherViews() {
  if (typeof BroadcastChannel === "undefined") return;
  const channel = new BroadcastChannel(memberDirectoryChannelName);
  channel.postMessage("changed");
  channel.close();
}

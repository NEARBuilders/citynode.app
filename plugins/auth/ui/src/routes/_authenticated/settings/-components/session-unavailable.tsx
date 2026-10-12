import { SignInIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { Link, useRouterState } from "@tanstack/react-router";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useLoginTranslation } from "@/i18n/runtime";

type SessionQueryState = {
  isPending: boolean;
  isError: boolean;
  refetch: () => unknown;
};

export function SessionUnavailable({ query }: { query: SessionQueryState }) {
  const translate = useLoginTranslation();

  if (query.isPending) {
    return (
      <div className="flex flex-col gap-4" data-testid="settings-session-loading">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-16 w-full rounded-2xl" />
      </div>
    );
  }

  if (query.isError) {
    return (
      <div data-testid="settings-session-error">
        <EmptyState
          icon={WarningCircleIcon}
          title={translate("auth.settings.sessionLoadFailed")}
          description={translate("auth.common.connectionHint")}
          action={
            <Button
              variant="outline"
              onClick={() => void query.refetch()}
              data-testid="settings-session-retry-button"
            >
              {translate("auth.common.retry")}
            </Button>
          }
        />
      </div>
    );
  }

  return <SignedOutState />;
}

function SignedOutState() {
  const translate = useLoginTranslation();
  const href = useRouterState({ select: (state) => state.location.href });

  return (
    <div data-testid="settings-signed-out">
      <EmptyState
        icon={SignInIcon}
        title={translate("auth.settings.signedOut")}
        description={translate("auth.settings.signedOutHint")}
        action={
          <Button
            nativeButton={false}
            render={<Link to="/login" search={{ redirect: href }} />}
            data-testid="settings-signin-button"
          >
            {translate("auth.login.signIn")}
          </Button>
        }
      />
    </div>
  );
}

import { CompassIcon, SignInIcon } from "@phosphor-icons/react";
import { Link, useLocation } from "@tanstack/react-router";
import type { ComponentType } from "react";
import { pluginHref, pluginPath } from "@/app";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { isNotFoundError, isPermissionError, isSessionError } from "@/i18n/error-message";
import { useAppTranslation } from "@/i18n/runtime";
import { CannotEditState } from "./cannot-edit-state";

export function DiscoveryLoadError({
  error,
  nodeId,
  icon,
  title,
  onRetry,
}: {
  error: unknown;
  nodeId: string;
  icon: ComponentType<{ size?: number; className?: string }>;
  title: string;
  onRetry: () => void;
}) {
  const translate = useAppTranslation();
  const href = useLocation({ select: (location) => location.href });
  if (isPermissionError(error)) return <CannotEditState nodeId={nodeId} />;
  if (isSessionError(error))
    return (
      <div data-testid="community-session-expired">
        <EmptyState
          icon={SignInIcon}
          title={translate("error.session")}
          action={
            <Button
              nativeButton={false}
              data-testid="community-session-sign-in"
              render={
                <Link to={pluginPath("/login")} href={pluginHref("/login", { redirect: href })} />
              }
            >
              {translate("nav.signIn")}
            </Button>
          }
        />
      </div>
    );
  if (isNotFoundError(error))
    return (
      <div data-testid="community-not-found">
        <EmptyState
          icon={CompassIcon}
          title={translate("community.notFound")}
          description={translate("community.notFoundDescription")}
          action={
            <Button
              variant="outline"
              nativeButton={false}
              data-testid="community-not-found-home"
              render={<Link to="/dashboard" />}
            >
              {translate("common.backHome")}
            </Button>
          }
        />
      </div>
    );
  return (
    <div data-testid="community-load-error">
      <EmptyState
        icon={icon}
        title={title}
        description={translate("events.connectionHint")}
        action={
          <Button variant="outline" data-testid="community-load-error-retry" onClick={onRetry}>
            {translate("common.retry")}
          </Button>
        }
      />
    </div>
  );
}

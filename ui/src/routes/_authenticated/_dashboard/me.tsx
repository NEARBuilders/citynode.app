import { GearIcon, UserCircleIcon, UserIcon } from "@phosphor-icons/react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { pluginPath } from "@/app";
import { AttendanceRecord } from "@/components/attendance-record";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { useIdentity } from "@/components/layout/use-identity";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { resolveAppLocale, translateAppMessage, useAppTranslation } from "@/i18n/runtime";
import { pageTitle } from "@/lib/page-title";

export const Route = createFileRoute("/_authenticated/_dashboard/me")({
  head: ({ match }) => ({
    meta: [
      {
        title: pageTitle(
          translateAppMessage(
            "nav.activity",
            undefined,
            resolveAppLocale(undefined, match.context.locale),
          ),
          match.context.runtimeConfig,
        ),
      },
    ],
  }),
  component: MePage,
});

/**
 * The member's own page: who they are, with links to edit the profile the auth
 * plugin keeps in Settings, and the events they checked in at across communities.
 */
export function MePage() {
  const translate = useAppTranslation();
  const { nearAccountId, avatarSrc, displayName, handle, showHandle, initials } = useIdentity();

  return (
    <PageContainer variant="default">
      <div className="flex flex-col gap-10">
        <PageHeader
          headerTestId="me.header"
          title={
            <span className="flex min-w-0 items-center gap-4">
              <Avatar size="lg" className="shrink-0">
                {avatarSrc ? <AvatarImage src={avatarSrc} alt="" /> : null}
                <AvatarFallback>{initials || <UserIcon className="size-4" />}</AvatarFallback>
              </Avatar>
              <span className="min-w-0 wrap-anywhere">{displayName}</span>
            </span>
          }
          subtitle={showHandle ? handle : undefined}
          description={translate("me.description")}
          actions={
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                nativeButton={false}
                render={<Link to={pluginPath("/settings/profile")} />}
                data-testid="me.edit-profile"
              >
                <GearIcon />
                {translate("me.editProfile")}
              </Button>
              {nearAccountId && (
                <Button
                  variant="outline"
                  nativeButton={false}
                  render={<Link to="/$accountId" params={{ accountId: nearAccountId }} />}
                  data-testid="me.public-profile"
                >
                  <UserCircleIcon />
                  {translate("me.publicProfile")}
                </Button>
              )}
            </div>
          }
        />
        <AttendanceRecord alwaysShow testId="me.attendance" />
      </div>
    </PageContainer>
  );
}

import { EnvelopeSimpleIcon } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { Trans } from "everything-dev/ui/i18n";
import { toast } from "sonner";
import { useApiClient, useAuthClient } from "@/app";
import {
  Avatar,
  AvatarFallback,
  Badge,
  Button,
  EmptyState,
  LocalDate,
  PageContainer,
  Skeleton,
} from "@/components";
import { resolveAppLocale, translateAppMessage, useAppTranslation } from "@/i18n/runtime";
import { pageTitle } from "@/lib/page-title";
import { presentationLabel } from "@/lib/presentation-label";
import { useInvitationActions } from "./-use-invitation-actions";

export const Route = createFileRoute("/_authenticated/_dashboard/orgs/invites/$id")({
  head: ({ match }) => ({
    meta: [
      {
        title: pageTitle(
          translateAppMessage(
            "nav.invitation",
            undefined,
            resolveAppLocale(undefined, match.context.locale),
          ),
          match.context.runtimeConfig,
        ),
      },
    ],
  }),
  loader: async ({ context, params }) => {
    await context.queryClient.ensureQueryData({
      queryKey: ["invitation", params.id],
      queryFn: () => context.apiClient.auth.getInvitation({ id: params.id }),
      staleTime: 30 * 1000,
      retry: false,
    });
  },
  component: AcceptInvitation,
});

function AcceptInvitation() {
  const translate = useAppTranslation();
  const { id } = Route.useParams();
  const router = useRouter();
  const auth = useAuthClient();
  const apiClient = useApiClient();

  const { data: invitation, isLoading } = useQuery({
    queryKey: ["invitation", id],
    queryFn: () => apiClient.auth.getInvitation({ id }),
    staleTime: 30 * 1000,
    retry: false,
  });

  const { acceptMutation, rejectMutation } = useInvitationActions({
    apiClient,
    auth,
    onAccepted: async (acceptedInvitation) => {
      toast.success(translate("org.inviteAccepted"));
      if (acceptedInvitation.organizationSlug) {
        await router.navigate({
          to: "/orgs/$slug",
          params: { slug: acceptedInvitation.organizationSlug },
        });
      } else {
        await router.navigate({ to: "/orgs" });
      }
    },
    onRejected: async () => {
      toast.success(translate("org.inviteDeclined"));
      await router.navigate({ to: "/orgs" });
    },
  });

  if (isLoading) {
    return (
      <PageContainer variant="narrow">
        <div className="flex flex-col items-center gap-4 py-12">
          <Skeleton className="size-16 rounded-full" />
          <Skeleton className="h-9 w-64" />
          <Skeleton className="h-5 w-48" />
        </div>
      </PageContainer>
    );
  }

  if (!invitation) {
    return (
      <PageContainer variant="narrow">
        <EmptyState
          icon={EnvelopeSimpleIcon}
          title={translate("org.inviteUnavailable")}
          description={translate("org.inviteUnavailableDescription")}
          action={
            <Button variant="outline" nativeButton={false} render={<Link to="/orgs" />}>
              {translate("org.goOrganizations")}
            </Button>
          }
        />
      </PageContainer>
    );
  }

  const busy = acceptMutation.isPending || rejectMutation.isPending;
  const orgName =
    invitation.organizationName ??
    invitation.organizationSlug ??
    translate("dashboard.orgFallback");
  const isPending = invitation.status === "pending";

  return (
    <PageContainer variant="narrow">
      <div
        className="flex flex-col items-center gap-8 py-8 text-center sm:py-16"
        data-testid="invite.accept"
      >
        <Avatar className="size-16">
          <AvatarFallback>{orgName.charAt(0).toUpperCase()}</AvatarFallback>
        </Avatar>
        <div className="flex flex-col gap-3">
          <h1 className="text-3xl font-semibold wrap-anywhere text-foreground sm:text-4xl">
            {translate("invitation.joinTitle", { name: orgName })}
          </h1>
          <p className="text-base text-muted-foreground">
            {translate(
              invitation.teamId ? "organization.invitedTeamRole" : "invitation.roleNamed",
              { role: presentationLabel(invitation.role ?? "member", translate) },
            )}
          </p>
        </div>
        {isPending ? (
          <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:justify-center">
            <Button
              size="lg"
              onClick={() => acceptMutation.mutate(invitation)}
              disabled={busy}
              data-testid="invite.accept-button"
            >
              {acceptMutation.isPending
                ? translate("org.joining")
                : translate("invitation.joinTitle", { name: orgName })}
            </Button>
            <Button
              variant="ghost"
              size="lg"
              onClick={() => rejectMutation.mutate(invitation)}
              disabled={busy}
              data-testid="invite.decline-button"
            >
              {rejectMutation.isPending ? translate("org.declining") : translate("org.decline")}
            </Button>
          </div>
        ) : (
          <Badge variant="outline">
            {translate("invitation.statusNamed", {
              status: presentationLabel(invitation.status, translate),
            })}
          </Badge>
        )}
        <p className="text-sm wrap-anywhere text-muted-foreground">
          {translate(
            invitation.nearAccountId && invitation.nearNetwork
              ? "invitation.forNetworkNamed"
              : "invitation.forNamed",
            {
              account: invitation.nearAccountId ?? invitation.email ?? "",
              network: invitation.nearNetwork ?? "",
            },
          )}{" "}
          ·{" "}
          <Trans
            id="date.expires"
            components={{ date: <LocalDate value={invitation.expiresAt} format="relative" /> }}
          />
        </p>
      </div>
    </PageContainer>
  );
}

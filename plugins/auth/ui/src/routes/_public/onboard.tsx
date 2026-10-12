import {
  ArrowRightIcon,
  CheckCircleIcon,
  CheckIcon,
  CopyIcon,
  DesktopIcon,
  TicketIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { refreshSessionCache, sessionQueryOptions, useAuthClient } from "everything-dev/ui/auth";
import { Trans } from "everything-dev/ui/i18n";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { AuthPanel } from "@/components/auth-panel";
import { StepProgress } from "@/components/step-progress";
import { Button } from "@/components/ui/button";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item";
import { Spinner } from "@/components/ui/spinner";
import type { LoginMessageId } from "@/i18n/catalogs";
import { useLoginTranslation } from "@/i18n/runtime";
import { findCommunityPage } from "@/lib/community-page";
import { getGatewayOrigin } from "@/lib/gateway-origin";
import { DisplayNameStep } from "./-display-name-step";
import { OnboardSignUp } from "./-onboard-sign-up";
import "../../styles.css";
import { LoginI18nProvider } from "@/i18n/runtime";

type SearchParams = {
  code?: string;
};

function sanitizeCode(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return /^[A-Za-z0-9_-]{10,64}$/.test(trimmed) ? trimmed : undefined;
}

export const Route = createFileRoute("/_public/onboard")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>): SearchParams => ({
    code: sanitizeCode(search.code),
  }),
  component: OnboardPage,
});

type Redeemed = { organizationId: string; organizationName: string; eventName: string };

const PASSKEY_DEFAULT_NAME = "Passkey user";

const redeemReasons = [
  "organization_not_active",
  "organization_full",
  "code_revoked",
  "code_expired",
  "code_used_up",
  "code_not_found",
  "organization_not_found",
] as const;

type RedeemReason = (typeof redeemReasons)[number];
type RedeemFailure = RedeemReason | "network";
type StatusAction = "retry" | "explore" | "ask-organizer";

const redeemCopy: Record<
  RedeemReason,
  { title: LoginMessageId; action: Exclude<StatusAction, "retry"> }
> = {
  organization_not_active: { title: "auth.onboard.communityNotOpen", action: "explore" },
  organization_full: { title: "auth.onboard.communityFull", action: "explore" },
  code_revoked: { title: "auth.onboard.invitationRevoked", action: "ask-organizer" },
  code_expired: { title: "auth.onboard.invitationExpired", action: "ask-organizer" },
  code_used_up: { title: "auth.onboard.invitationUsedUp", action: "ask-organizer" },
  code_not_found: { title: "auth.onboard.invitationInvalid", action: "ask-organizer" },
  organization_not_found: { title: "auth.onboard.invitationInvalid", action: "ask-organizer" },
};

function redeemFailureOf(error: unknown): RedeemFailure {
  if (!error || typeof error !== "object") return "network";
  const data = "data" in error ? error.data : undefined;
  const reason =
    data && typeof data === "object" && data && "reason" in data
      ? (data as { reason: unknown }).reason
      : undefined;
  return typeof reason === "string" && (redeemReasons as readonly string[]).includes(reason)
    ? (reason as RedeemReason)
    : "network";
}

function hasChosenName(accountCreated: boolean, name: string | undefined | null): boolean {
  return !accountCreated && !!name && name !== PASSKEY_DEFAULT_NAME;
}

function OnboardPage() {
  return (
    <LoginI18nProvider>
      <OnboardContent />
    </LoginI18nProvider>
  );
}

function OnboardContent() {
  const translate = useLoginTranslation();
  const JOIN_STEPS = [
    translate("auth.onboard.stepAccount"),
    translate("auth.onboard.stepJoin"),
    translate("auth.onboard.stepName"),
  ];
  const auth = useAuthClient();
  const queryClient = useQueryClient();
  const code = sanitizeCode(Route.useSearch().code);
  const { apiClient, runtimeConfig } = Route.useRouteContext();
  const { data: session, isPending: sessionPending } = useQuery(sessionQueryOptions(auth));
  const infoQuery = useQuery({
    queryKey: ["onboarding-info", code],
    queryFn: async () => {
      return apiClient.auth.getOnboardingCodeInfo({ code: code! });
    },
    enabled: !!code,
    retry: false,
  });
  const info = infoQuery.data;

  const [accountCreated, setAccountCreated] = useState(false);
  const [redeemed, setRedeemed] = useState<Redeemed | null>(null);
  const { data: communityPage } = useQuery({
    queryKey: ["onboarding-community-page", redeemed?.organizationId],
    queryFn: () => findCommunityPage(apiClient, redeemed?.organizationId ?? ""),
    enabled: !!redeemed?.organizationId,
    retry: false,
  });
  const [nameDone, setNameDone] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [redeemError, setRedeemError] = useState<RedeemFailure | null>(null);
  const redeemingRef = useRef(false);

  const copyPairLink = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setLinkCopied(true);
      toast.success(translate("auth.onboard.linkCopied"));
      setTimeout(() => setLinkCopied(false), 2000);
    } catch {
      toast.error(translate("auth.onboard.copyFailed"));
    }
  };

  useEffect(() => {
    if (!session?.user || !code || redeemingRef.current || redeemed || redeemError) return;
    redeemingRef.current = true;
    void apiClient.auth
      .redeemOnboardingCode({ code })
      .then((result: Redeemed) => {
        setRedeemed({
          organizationId: result.organizationId,
          organizationName: result.organizationName,
          eventName: result.eventName,
        });
        toast.success(
          translate("auth.onboard.joinedToast", { organization: result.organizationName }),
        );
        void refreshSessionCache(auth, queryClient);
      })
      .catch((error: unknown) => {
        setRedeemError(redeemFailureOf(error));
      });
  }, [session?.user, code, redeemed, redeemError, auth, apiClient, queryClient, translate]);

  if (redeemed) {
    const joinedLine = (
      <span data-testid="onboard.success">
        <Trans
          id="auth.onboard.joinedLine"
          values={{ organization: redeemed.organizationName, event: redeemed.eventName }}
          components={{ organization: <span className="font-medium text-foreground" /> }}
        />
      </span>
    );

    if (!nameDone && !hasChosenName(accountCreated, session?.user.name)) {
      return (
        <AuthPanel
          icon={<CheckCircleIcon />}
          title={translate("auth.onboard.ready")}
          titleTestId="onboard.heading"
          description={joinedLine}
        >
          <StepProgress steps={JOIN_STEPS} current={2} testId="onboard.progress" />
          <DisplayNameStep
            initialName={accountCreated ? "" : (session?.user.name ?? "")}
            onDone={() => setNameDone(true)}
          />
        </AuthPanel>
      );
    }

    const gatewayOrigin = getGatewayOrigin(runtimeConfig);
    const gatewayHost = new URL(gatewayOrigin).host;
    const pairUrl = `${gatewayOrigin}/login?method=phone`;
    return (
      <AuthPanel
        icon={<CheckCircleIcon />}
        title={translate("auth.onboard.readyBuild")}
        titleTestId="onboard.heading"
        description={joinedLine}
      >
        <Button
          size="lg"
          className="w-full"
          nativeButton={false}
          render={<Link to="/build" />}
          data-testid="onboard.build-button"
        >
          {translate("auth.onboard.buildPrompts")}
        </Button>
        {communityPage && (
          <Button
            variant="outline"
            size="lg"
            className="w-full"
            nativeButton={false}
            render={
              <Link
                to="/n/$slug"
                params={{ slug: communityPage.slug }}
                search={communityPage.parentId ? { parentId: communityPage.parentId } : {}}
              />
            }
            data-testid="onboard.community-link"
          >
            {translate("auth.onboard.seeCommunity", { community: redeemed.organizationName })}
            <ArrowRightIcon />
          </Button>
        )}
        <Item variant="muted" data-testid="onboard.continue-on-computer">
          <ItemMedia variant="icon">
            <DesktopIcon />
          </ItemMedia>
          <ItemContent>
            <ItemTitle>{translate("auth.onboard.desktop")}</ItemTitle>
            <ItemDescription>
              <Trans
                id="auth.onboard.desktopHelp"
                values={{ url: `${gatewayHost}/login?method=phone` }}
                components={{
                  url: (
                    <span
                      className="font-mono text-foreground"
                      data-testid="onboard.gateway-origin"
                    />
                  ),
                }}
              />
            </ItemDescription>
          </ItemContent>
          <ItemActions className="w-full sm:w-auto">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full sm:w-auto"
              onClick={() => void copyPairLink(pairUrl)}
              data-testid="onboard.continue-copy-link"
            >
              {linkCopied ? <CheckIcon /> : <CopyIcon />}
              {linkCopied ? translate("auth.common.copied") : translate("auth.common.copyLink")}
            </Button>
          </ItemActions>
        </Item>
        <Button
          size="lg"
          className="w-full"
          nativeButton={false}
          render={<Link to="/dashboard" />}
          data-testid="onboard.home-button"
        >
          {translate("auth.onboard.home")}
        </Button>
      </AuthPanel>
    );
  }

  if (!code) {
    return (
      <StatusPanel
        title={translate("auth.onboard.invalid")}
        description={translate("auth.onboard.missingCode")}
        testId="onboard.invalid"
        action="explore"
      />
    );
  }

  if (infoQuery.isError) {
    return (
      <StatusPanel
        title={translate("auth.onboard.loadFailed")}
        testId="onboard.load-error"
        action="retry"
        onRetry={() => {
          void infoQuery.refetch();
        }}
      />
    );
  }

  const awaitingJoin = sessionPending || (!!session?.user && !redeemError);
  const closedForNewcomers = !!info && !info.revoked && (info.expired || info.usedUp);

  if (info === undefined || (closedForNewcomers && awaitingJoin)) {
    return (
      <div className="flex flex-1 items-center justify-center px-4 py-20">
        <p
          className="flex items-center gap-2 text-sm text-muted-foreground"
          data-testid="onboard.loading"
        >
          <Spinner />
          {translate("auth.onboard.loading")}
        </p>
      </div>
    );
  }

  if (info === null) {
    return (
      <StatusPanel
        title={translate("auth.onboard.notFound")}
        description={translate("auth.onboard.invalidCode")}
        testId="onboard.not-found"
        action="ask-organizer"
      />
    );
  }

  if (redeemError === "network") {
    return (
      <StatusPanel
        title={translate("auth.onboard.joinUnavailable")}
        testId="onboard.error"
        action="retry"
        onRetry={() => {
          redeemingRef.current = false;
          setRedeemError(null);
        }}
      />
    );
  }

  if (info.revoked || info.expired || info.usedUp) {
    return (
      <StatusPanel
        title={translate("auth.onboard.unavailable")}
        description={
          info.revoked
            ? translate("auth.onboard.revoked")
            : info.expired
              ? translate("auth.onboard.expired")
              : translate("auth.onboard.limit")
        }
        testId="onboard.unavailable"
        action="ask-organizer"
      />
    );
  }

  if (redeemError) {
    const copy =
      redeemError === "network"
        ? { title: "auth.onboard.joinUnavailable" as const, action: "retry" as const }
        : redeemCopy[redeemError];
    return (
      <StatusPanel
        title={translate(copy.title)}
        description={
          copy.action === "ask-organizer" ? translate("auth.onboard.askOrganizer") : undefined
        }
        testId="onboard.error"
        action={copy.action}
        onRetry={() => {
          redeemingRef.current = false;
          setRedeemError(null);
        }}
      />
    );
  }

  if (session?.user) {
    return (
      <AuthPanel
        icon={<TicketIcon />}
        title={translate("auth.onboard.joining", { organization: info.organizationName })}
        titleTestId="onboard.heading"
      >
        <StepProgress steps={JOIN_STEPS} current={1} testId="onboard.progress" />
        <p
          className="flex items-center justify-center gap-2 text-sm text-muted-foreground"
          data-testid="onboard.status"
        >
          <Spinner />
          {translate("auth.onboard.adding", { event: info.eventName })}
        </p>
      </AuthPanel>
    );
  }

  return (
    <AuthPanel
      icon={<TicketIcon />}
      eyebrow={
        info.inviterName
          ? translate("auth.onboard.invitedBy", { name: info.inviterName })
          : translate("auth.onboard.invited")
      }
      title={translate("auth.onboard.joinTitle", { organization: info.organizationName })}
      titleTestId="onboard.heading"
      description={
        <Trans
          id="auth.onboard.eventWithOrg"
          values={{ organization: info.organizationName, event: info.eventName }}
          components={{ organization: <span className="font-medium text-foreground" /> }}
        />
      }
      descriptionTestId="onboard.invite"
    >
      <StepProgress steps={JOIN_STEPS} current={0} testId="onboard.progress" />
      <OnboardSignUp
        networkId={runtimeConfig?.networkId ?? "mainnet"}
        onAccountCreated={() => setAccountCreated(true)}
      />
    </AuthPanel>
  );
}

function StatusPanel({
  title,
  description,
  testId,
  action,
  onRetry,
}: {
  title: string;
  description?: string;
  testId: string;
  action: StatusAction;
  onRetry?: () => void;
}) {
  const translate = useLoginTranslation();
  const panel = (
    <AuthPanel
      icon={<WarningCircleIcon />}
      title={title}
      titleTestId="onboard.heading"
      description={description}
      descriptionTestId={description ? testId : undefined}
    >
      {action === "retry" ? (
        <Button
          variant="outline"
          size="lg"
          className="w-full"
          onClick={onRetry}
          data-testid="onboard.retry-button"
        >
          {translate("auth.common.retry")}
        </Button>
      ) : action === "explore" ? (
        <Button
          variant="outline"
          size="lg"
          className="w-full"
          nativeButton={false}
          render={<Link to="/explore" />}
          data-testid="onboard.explore-button"
        >
          {translate("auth.common.exploreCommunities")}
        </Button>
      ) : null}
    </AuthPanel>
  );
  return description ? panel : <div data-testid={testId}>{panel}</div>;
}

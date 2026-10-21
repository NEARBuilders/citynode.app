import type { OnboardingRedeemReason } from "@everything-dev/auth-plugin/contract";
import { safe } from "@orpc/client";
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
import { type ReactNode, useEffect, useRef, useState } from "react";
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
import { LoginLanguageSelector } from "@/i18n/language-selector";
import { LoginI18nProvider, useLoginTranslation } from "@/i18n/runtime";
import { findCommunityPage } from "@/lib/community-page";
import { getGatewayOrigin } from "@/lib/gateway-origin";
import { DisplayNameStep } from "./-display-name-step";
import { OnboardSignUp } from "./-onboard-sign-up";
import "../../styles.css";

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
type RedeemFailure = OnboardingRedeemReason | "network";
type StatusAction = "retry" | "explore" | "contact-community";

const PASSKEY_DEFAULT_NAME = "Passkey user";

function redeemedStorageKey(code: string) {
  return `citynode.onboard.redeemed:${code}`;
}

function readStoredRedeemed(code: string | undefined): Redeemed | null {
  if (!code) return null;
  try {
    const raw = sessionStorage.getItem(redeemedStorageKey(code));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Redeemed>;
    if (
      typeof parsed.organizationId === "string" &&
      typeof parsed.organizationName === "string" &&
      typeof parsed.eventName === "string"
    ) {
      return {
        organizationId: parsed.organizationId,
        organizationName: parsed.organizationName,
        eventName: parsed.eventName,
      };
    }
  } catch {
    return null;
  }
  return null;
}

function storeRedeemed(code: string, data: Redeemed) {
  try {
    sessionStorage.setItem(redeemedStorageKey(code), JSON.stringify(data));
  } catch {
    return;
  }
}

const redeemCopy: Record<
  OnboardingRedeemReason,
  { title: LoginMessageId; action: Exclude<StatusAction, "retry"> }
> = {
  organization_not_active: { title: "auth.onboard.communityNotOpen", action: "explore" },
  organization_full: { title: "auth.onboard.communityFull", action: "explore" },
  code_revoked: { title: "auth.onboard.invitationRevoked", action: "contact-community" },
  code_expired: { title: "auth.onboard.invitationExpired", action: "contact-community" },
  code_used_up: { title: "auth.onboard.invitationUsedUp", action: "contact-community" },
  code_not_found: { title: "auth.onboard.invitationInvalid", action: "contact-community" },
  organization_not_found: { title: "auth.onboard.invitationInvalid", action: "contact-community" },
};

function isRedeemReason(value: unknown): value is OnboardingRedeemReason {
  return typeof value === "string" && Object.hasOwn(redeemCopy, value);
}

function definedRedeemError(error: unknown): { code?: string; reason?: unknown } {
  if (!error || typeof error !== "object") return {};
  const code = "code" in error && typeof error.code === "string" ? error.code : undefined;
  const data = "data" in error && error.data && typeof error.data === "object" ? error.data : null;
  const reason = data && "reason" in data ? data.reason : undefined;
  return { code, reason };
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
  const joinProgress = (current: number) => (
    <StepProgress
      steps={JOIN_STEPS}
      current={current}
      testId="onboard.progress"
      label={translate("auth.progress.label")}
      stepLabel={translate("auth.progress.step", {
        step: current + 1,
        total: JOIN_STEPS.length,
      })}
    />
  );
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
  const [redeemed, setRedeemed] = useState<Redeemed | null>(() => readStoredRedeemed(code));
  const { data: communityPage } = useQuery({
    queryKey: ["onboarding-community-page", redeemed?.organizationId],
    queryFn: () => findCommunityPage(apiClient, redeemed?.organizationId ?? ""),
    enabled: !!redeemed?.organizationId,
    retry: false,
  });
  const [nameDone, setNameDone] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [redeemError, setRedeemError] = useState<RedeemFailure | null>(null);
  const [signInAgain, setSignInAgain] = useState(false);
  const redeemingRef = useRef(false);
  const signedIn = !!session?.user && !signInAgain;
  const languageSelect = <LoginLanguageSelector testId="onboard.language-select" />;

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
    setRedeemed(readStoredRedeemed(code));
  }, [code]);

  useEffect(() => {
    if (!signedIn || !code || redeemingRef.current || redeemed || redeemError) return;
    redeemingRef.current = true;
    void safe(apiClient.auth.redeemOnboardingCode({ code }) as Promise<Redeemed>).then(
      ({ data, definedError, error, isSuccess }) => {
        if (isSuccess) {
          setRedeemed(data);
          storeRedeemed(code, data);
          toast.success(
            translate("auth.onboard.joinedToast", { community: data.organizationName }),
          );
          void refreshSessionCache(auth, queryClient);
          return;
        }
        const failure = definedRedeemError(definedError ?? error);
        if (failure.code === "UNAUTHORIZED") {
          redeemingRef.current = false;
          setSignInAgain(true);
          void refreshSessionCache(auth, queryClient);
          return;
        }
        setRedeemError(isRedeemReason(failure.reason) ? failure.reason : "network");
      },
    );
  }, [signedIn, code, redeemed, redeemError, auth, apiClient, queryClient, translate]);

  if (redeemed) {
    const joinedLine = (
      <span data-testid="onboard.success">
        <Trans
          id="auth.onboard.joinedLine"
          values={{ community: redeemed.organizationName, event: redeemed.eventName }}
          components={{ community: <span className="font-medium text-foreground" /> }}
        />
      </span>
    );

    if (!nameDone && !hasChosenName(accountCreated, session?.user.name)) {
      return (
        <AuthPanel
          icon={<CheckCircleIcon />}
          toolbar={languageSelect}
          title={translate("auth.onboard.ready")}
          titleTestId="onboard.heading"
          description={joinedLine}
        >
          {joinProgress(2)}
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
        toolbar={languageSelect}
        title={translate("auth.onboard.ready")}
        titleTestId="onboard.heading"
        description={joinedLine}
      >
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
        toolbar={languageSelect}
      />
    );
  }

  if (infoQuery.isError && !(infoQuery.isFetching && info === undefined)) {
    return (
      <StatusPanel
        title={translate("auth.onboard.loadFailed")}
        testId="onboard.load-error"
        action="retry"
        retrying={infoQuery.isFetching}
        toolbar={languageSelect}
        onRetry={() => {
          void infoQuery.refetch();
        }}
      />
    );
  }

  const awaitingJoin = sessionPending || (signedIn && !redeemError);
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
        action="contact-community"
        toolbar={languageSelect}
      />
    );
  }

  if (redeemError === "network" && !info.revoked) {
    return (
      <StatusPanel
        title={translate("auth.onboard.joinUnavailable")}
        testId="onboard.error"
        action="retry"
        toolbar={languageSelect}
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
        action="contact-community"
        toolbar={languageSelect}
      />
    );
  }

  if (redeemError && redeemError !== "network") {
    const copy = redeemCopy[redeemError];
    return (
      <StatusPanel
        title={translate(copy.title)}
        description={
          copy.action === "contact-community" ? translate("auth.onboard.askOrganizer") : undefined
        }
        testId="onboard.error"
        action={copy.action}
        toolbar={languageSelect}
      />
    );
  }

  if (signedIn) {
    return (
      <AuthPanel
        icon={<TicketIcon />}
        toolbar={languageSelect}
        title={translate("auth.onboard.joining", { community: info.organizationName })}
        titleTestId="onboard.heading"
      >
        {joinProgress(1)}
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
      toolbar={languageSelect}
      eyebrow={
        info.inviterName
          ? translate("auth.onboard.invitedBy", { name: info.inviterName })
          : translate("auth.onboard.invited")
      }
      title={translate("auth.onboard.joinTitle", { community: info.organizationName })}
      titleTestId="onboard.heading"
      description={
        <Trans
          id="auth.onboard.eventWithCommunity"
          values={{ community: info.organizationName, event: info.eventName }}
          components={{ community: <span className="font-medium text-foreground" /> }}
        />
      }
      descriptionTestId="onboard.invite"
    >
      {joinProgress(0)}
      {signInAgain ? (
        <p
          className="text-center text-sm text-muted-foreground"
          data-testid="onboard.sign-in-again"
        >
          {translate("auth.onboard.signInDifferent")}
        </p>
      ) : null}
      <OnboardSignUp
        networkId={runtimeConfig?.networkId ?? "mainnet"}
        onAccountCreated={() => setAccountCreated(true)}
        onSignedIn={() => setSignInAgain(false)}
      />
    </AuthPanel>
  );
}

function StatusPanel({
  title,
  description,
  testId,
  action,
  retrying = false,
  toolbar,
  onRetry,
}: {
  title: string;
  description?: string;
  testId: string;
  action: StatusAction;
  retrying?: boolean;
  toolbar?: ReactNode;
  onRetry?: () => void;
}) {
  const translate = useLoginTranslation();
  const panel = (
    <AuthPanel
      icon={<WarningCircleIcon />}
      toolbar={toolbar}
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
          disabled={retrying}
          data-testid="onboard.retry-button"
        >
          {retrying ? <Spinner data-icon="inline-start" /> : null}
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

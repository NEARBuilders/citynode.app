import {
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
import { useLoginTranslation } from "@/i18n/runtime";
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

type Redeemed = { organizationName: string; eventName: string };

const PASSKEY_DEFAULT_NAME = "Passkey user";

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
  const { data: info } = useQuery({
    queryKey: ["onboarding-info", code],
    queryFn: async () => {
      return apiClient.auth.getOnboardingCodeInfo({ code: code! });
    },
    enabled: !!code,
  });

  const [accountCreated, setAccountCreated] = useState(false);
  const [redeemed, setRedeemed] = useState<Redeemed | null>(null);
  const [nameDone, setNameDone] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [redeemError, setRedeemError] = useState(false);
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
        setRedeemed({ organizationName: result.organizationName, eventName: result.eventName });
        toast.success(
          translate("auth.onboard.joinedToast", { organization: result.organizationName }),
        );
        void refreshSessionCache(auth, queryClient);
      })
      .catch(() => {
        setRedeemError(true);
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
      />
    );
  }

  if (redeemError) {
    return (
      <StatusPanel
        title={translate("auth.onboard.joinFailed")}
        description={translate("auth.onboard.joinError")}
        testId="onboard.error"
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
}: {
  title: string;
  description: string;
  testId: string;
}) {
  const translate = useLoginTranslation();
  return (
    <AuthPanel
      icon={<WarningCircleIcon />}
      title={title}
      titleTestId="onboard.heading"
      description={description}
      descriptionTestId={testId}
    >
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
    </AuthPanel>
  );
}

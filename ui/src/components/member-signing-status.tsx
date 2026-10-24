import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useAppTranslation } from "@/i18n/runtime";
import { MEMBER_SIGNING_MESSAGES, type MemberSigningState } from "@/lib/member-wallet";

export interface MemberSigningStatusProps {
  state: MemberSigningState;
  onRetry?: () => void;
}

export function MemberSigningStatus({ state, onRetry }: MemberSigningStatusProps) {
  const t = useAppTranslation();

  if (state.status === "idle") return null;

  if (state.status === "connecting" || state.status === "signing") {
    return (
      <p aria-live="polite" className="flex items-center gap-2 text-sm text-muted-foreground">
        <Spinner />
        {t(
          state.status === "connecting"
            ? "memberWallet.status.connecting"
            : "memberWallet.status.signing",
        )}
      </p>
    );
  }

  if (state.status === "submitted") {
    return (
      <p role="status" className="text-sm text-foreground">
        {t("memberWallet.status.submitted")}
      </p>
    );
  }

  const failure = state.failure ?? "unknown";
  const canRetry = failure !== "signedOut" && failure !== "rejected";
  return (
    <div role="alert" className="flex flex-wrap items-center gap-2 text-sm text-destructive">
      <span className="min-w-0 break-words">
        {t(MEMBER_SIGNING_MESSAGES[failure], state.failureValues)}
      </span>
      {canRetry && onRetry ? (
        <Button type="button" variant="outline" size="sm" onClick={onRetry}>
          {t("memberWallet.retry")}
        </Button>
      ) : null}
    </div>
  );
}

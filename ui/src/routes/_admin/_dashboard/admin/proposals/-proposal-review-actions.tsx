import { CheckIcon } from "@phosphor-icons/react";
import { type ChangeEvent, useState } from "react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  FieldDescription,
  FieldLabel,
  Textarea,
} from "@/components";
import { ConnectDao } from "@/components/connect-dao";
import { useAppTranslation } from "@/i18n/runtime";

interface ProposalReviewActionsProps {
  isPending: boolean;
  isRetry?: boolean;
  canReject?: boolean;
  applyError?: string | null;
  isNodeProposal: boolean;
  proposalDaoAccountId: string | null;
  daoIsVerified: boolean;
  rejectionReason: string;
  isReviewing: boolean;
  onDaoVerified: (value: { daoAccountId: string }) => void;
  onRejectionReasonChange: (event: ChangeEvent<HTMLTextAreaElement>) => void;
  onApprove: () => void;
  onReject: () => void;
}

export function ProposalReviewActions({
  isPending,
  isRetry = false,
  canReject = true,
  applyError,
  isNodeProposal,
  proposalDaoAccountId,
  daoIsVerified,
  rejectionReason,
  isReviewing,
  onDaoVerified,
  onRejectionReasonChange,
  onApprove,
  onReject,
}: ProposalReviewActionsProps) {
  const translate = useAppTranslation();
  const [rejecting, setRejecting] = useState(false);
  if (!isPending && !isRetry) return null;

  return (
    <div className="flex flex-col gap-6" data-testid="admin-proposal-decision">
      <h2 className="text-xl font-semibold">
        {isRetry ? translate("admin.proposal.retryApply") : translate("admin.proposal.decision")}
      </h2>
      {isRetry && applyError && (
        <p className="text-sm wrap-anywhere text-destructive" role="alert">
          {applyError}
        </p>
      )}
      {isRetry && (
        <p className="text-sm text-muted-foreground">{translate("admin.proposal.resumeHint")}</p>
      )}

      {isNodeProposal && (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">
            {translate("admin.proposedDaoNamed", {
              account: proposalDaoAccountId ?? translate("admin.proposal.daoFallback"),
            })}
          </p>
          <ConnectDao
            purpose="proposal-review"
            variant="plain"
            expectedDaoAccountId={proposalDaoAccountId}
            onVerified={onDaoVerified}
          />
        </div>
      )}

      <div className="flex flex-col gap-2">
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          <Button onClick={onApprove} disabled={isReviewing} data-testid="admin-proposal-approve">
            <CheckIcon />
            {isReviewing
              ? translate(isRetry ? "admin.proposal.resuming" : "admin.proposal.approving")
              : isRetry
                ? translate("admin.proposal.resume")
                : translate("common.approve")}
          </Button>
          {canReject && (
            <Button
              variant="ghost"
              onClick={() => setRejecting(true)}
              disabled={isReviewing}
              data-testid="admin-proposal-reject"
            >
              {translate("common.reject")}
            </Button>
          )}
        </div>
        {!daoIsVerified && (
          <p className="text-sm text-muted-foreground">
            {translate(isRetry ? "admin.proposal.retryDaoHint" : "admin.proposal.daoHint")}
          </p>
        )}
      </div>

      <Dialog open={rejecting} onOpenChange={setRejecting}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{translate("admin.proposal.rejectTitle")}</DialogTitle>
            <DialogDescription>
              {translate("admin.proposal.reasonSaved")}
              {isRetry && isNodeProposal && (
                <span className="mt-2 block">{translate("admin.proposal.rejectReleases")}</span>
              )}
            </DialogDescription>
          </DialogHeader>
          <Field>
            <FieldLabel htmlFor="rejection-reason">{translate("admin.proposal.reason")}</FieldLabel>
            <Textarea
              id="rejection-reason"
              value={rejectionReason}
              onChange={onRejectionReasonChange}
              placeholder={translate("admin.proposal.reasonExample")}
              rows={4}
            />
            <FieldDescription>{translate("common.required")}</FieldDescription>
          </Field>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejecting(false)} disabled={isReviewing}>
              {translate("common.cancel")}
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                setRejecting(false);
                onReject();
              }}
              disabled={!rejectionReason.trim() || isReviewing}
              data-testid="admin-proposal-reject-confirm"
            >
              {translate("admin.proposal.reject")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

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
  if (!isPending) return null;

  return (
    <div className="flex flex-col gap-6" data-testid="admin-proposal-decision">
      <h2 className="text-xl font-semibold">{translate("admin.proposal.decision")}</h2>

      {isNodeProposal && (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">
            {translate("admin.connectApproveNamed", {
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
          <Button
            onClick={onApprove}
            disabled={isReviewing || !daoIsVerified}
            data-testid="admin-proposal-approve"
          >
            <CheckIcon />
            {isReviewing ? translate("admin.proposal.approving") : translate("common.approve")}
          </Button>
          <Button
            variant="ghost"
            onClick={() => setRejecting(true)}
            disabled={isReviewing}
            data-testid="admin-proposal-reject"
          >
            {translate("common.reject")}
          </Button>
        </div>
        {!daoIsVerified && (
          <p className="text-sm text-muted-foreground">{translate("admin.proposal.daoHint")}</p>
        )}
      </div>

      <Dialog open={rejecting} onOpenChange={setRejecting}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{translate("admin.proposal.rejectTitle")}</DialogTitle>
            <DialogDescription>{translate("admin.proposal.reasonSaved")}</DialogDescription>
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

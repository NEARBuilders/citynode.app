import { CheckIcon, XIcon } from "@phosphor-icons/react";
import type { ChangeEvent } from "react";
import { Button, Card, Label, Textarea } from "@/components";
import { ConnectDao } from "@/components/connect-dao";

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
  return (
    <>
      {isPending && isNodeProposal && (
        <div className="space-y-3">
          <div className="space-y-1">
            <h2 className="text-base font-semibold text-foreground">Tenant DAO</h2>
            <p className="text-sm text-muted-foreground">
              Connect {proposalDaoAccountId ?? "the proposed DAO"} through Trezu. Approval creates
              the tenant records and submits its bos.config.json publish proposal to Sputnik DAO.
            </p>
          </div>
          <ConnectDao onVerified={onDaoVerified} />
        </div>
      )}

      {isPending ? (
        <Card className="space-y-4 p-6">
          <div className="space-y-1">
            <h2 className="text-base font-semibold text-foreground">Review action</h2>
            <p className="text-sm text-muted-foreground">
              Approve to publish this thing, or add required notes before rejecting it.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="rejection-reason">Review notes</Label>
            <Textarea
              id="rejection-reason"
              value={rejectionReason}
              onChange={onRejectionReasonChange}
              placeholder="Required when rejecting"
              rows={4}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={onApprove} disabled={isReviewing || !daoIsVerified}>
              <CheckIcon />
              {isReviewing ? "reviewing..." : "approve"}
            </Button>
            <Button
              variant="destructive"
              onClick={onReject}
              disabled={!rejectionReason.trim() || isReviewing}
            >
              <XIcon />
              reject
            </Button>
          </div>
        </Card>
      ) : (
        <Card className="p-6">
          <p className="text-sm text-muted-foreground">This proposal has already been reviewed.</p>
        </Card>
      )}
    </>
  );
}

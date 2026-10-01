import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuthClient } from "everything-dev/ui/auth";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { agentKeys, useAgentsClient } from "./-agent-queries";
import { createGrantCredential, forgetToken, signIntent, storeToken } from "./-intent-signing";

const ACTION_OPTIONS = ["swap", "withdraw", "intents_transfer", "sign:near_message", "*"] as const;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Issue a delegated grant: create a token client-side (only its commitment
 * is ever sent), generate the owner intent, sign it with the connected
 * wallet and submit. The token is stored locally per agent + label — the
 * execution console uses it as the x-grant-token credential.
 */
export function GrantIssueDialog({
  agentId,
  onOpenChange,
}: {
  agentId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const apiClient = useAgentsClient();
  const authClient = useAuthClient();
  const queryClient = useQueryClient();
  const [label, setLabel] = useState("");
  const [actions, setActions] = useState<string[]>(["swap", "intents_transfer"]);
  const [recipient, setRecipient] = useState("");
  const [days, setDays] = useState("7");

  const issue = useMutation({
    mutationFn: async () => {
      const credential = await createGrantCredential();
      const expiresAt = new Date(Date.now() + Number(days) * DAY_MS).toISOString();
      const generated = await apiClient.generateIntent({
        type: "grant_issue",
        agentId,
        label,
        credential: credential.commitment,
        actions,
        recipients: recipient
          ? [
              {
                action: "intents_transfer",
                kind: "intents-account",
                chain: "near",
                network: "mainnet",
                address: recipient,
                memo: { kind: "none" },
                purpose: "payout",
              },
            ]
          : [],
        signingAudiences: actions.includes("sign:near_message") && recipient ? [recipient] : [],
        expiresAt,
      });
      if (!generated || generated.status !== "PENDING_SIGNATURE") {
        throw new Error("Intent generation failed");
      }
      const signedData = await signIntent(authClient, generated.intent);
      await apiClient.submitIntent({
        type: "grant_issue",
        correlationId: generated.correlationId,
        signedData,
      });
      storeToken(agentId, label, credential.token);
      return { correlationId: generated.correlationId };
    },
    onSuccess: () => {
      toast.success(`Grant "${label}" issued — its token is stored on this device`);
      void queryClient.invalidateQueries({ queryKey: agentKeys.grants(agentId) });
      onOpenChange(false);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const toggleAction = (action: string) => {
    setActions((current) =>
      current.includes(action) ? current.filter((a) => a !== action) : [...current, action],
    );
  };

  return (
    <div className="flex flex-col gap-3">
      <Field>
        <FieldLabel>Label</FieldLabel>
        <Input
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          placeholder="e.g. dashboard-session"
          data-testid="agents-grant-label"
        />
        <FieldDescription>
          Shown when signing and on every operation it authorizes.
        </FieldDescription>
      </Field>
      <Field>
        <FieldLabel>Actions</FieldLabel>
        <div className="flex flex-wrap gap-2" data-testid="agents-grant-actions">
          {ACTION_OPTIONS.map((action) => (
            <Button
              key={action}
              type="button"
              size="sm"
              variant={actions.includes(action) ? "default" : "outline"}
              onClick={() => toggleAction(action)}
              data-testid={`agents-grant-action-${action}`}
            >
              {action}
            </Button>
          ))}
        </div>
      </Field>
      <Field>
        <FieldLabel>Payout recipient (optional)</FieldLabel>
        <Input
          value={recipient}
          onChange={(event) => setRecipient(event.target.value)}
          placeholder="recipient.near"
          data-testid="agents-grant-recipient"
        />
      </Field>
      <Field>
        <FieldLabel>Expires in (days)</FieldLabel>
        <Input
          type="number"
          min="1"
          max="90"
          value={days}
          onChange={(event) => setDays(event.target.value)}
          data-testid="agents-grant-days"
        />
      </Field>
      <Button
        type="button"
        disabled={!label || actions.length === 0 || !days || issue.isPending}
        onClick={() => issue.mutate()}
        data-testid="agents-grant-submit"
      >
        Sign &amp; issue grant
      </Button>
    </div>
  );
}

/** Revoke a live grant: owner-signed `grant_revoke` intent, then forget the local token. */
export function RevokeGrantButton({
  agentId,
  grantId,
  grantLabel,
}: {
  agentId: string;
  grantId: string;
  grantLabel: string;
}) {
  const apiClient = useAgentsClient();
  const authClient = useAuthClient();
  const queryClient = useQueryClient();

  const revoke = useMutation({
    mutationFn: async () => {
      const generated = await apiClient.generateIntent({
        type: "grant_revoke",
        agentId,
        grantId,
      });
      if (!generated || generated.status !== "PENDING_SIGNATURE") {
        throw new Error("Intent generation failed");
      }
      const signedData = await signIntent(authClient, generated.intent);
      await apiClient.submitIntent({
        type: "grant_revoke",
        correlationId: generated.correlationId,
        signedData,
      });
    },
    onSuccess: () => {
      toast.success(`Grant "${grantLabel}" revoked`);
      forgetToken(agentId, grantLabel);
      void queryClient.invalidateQueries({ queryKey: agentKeys.grants(agentId) });
      void queryClient.invalidateQueries({ queryKey: agentKeys.history(agentId) });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <Button
      type="button"
      size="sm"
      variant="destructive"
      disabled={revoke.isPending}
      onClick={() => revoke.mutate()}
      data-testid={`agents-grant-revoke-${grantId}`}
    >
      Revoke
    </Button>
  );
}

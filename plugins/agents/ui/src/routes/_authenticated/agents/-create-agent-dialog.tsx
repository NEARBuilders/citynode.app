import type { Policy, policyTransactionTypeSchema } from "@near-intents-agent-api/contracts";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuthClient } from "everything-dev/ui/auth";
import { useState } from "react";
import { toast } from "sonner";
import type { z } from "zod";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useAgentsClient } from "./-agent-queries";
import { signIntent } from "./-intent-signing";

const TRANSACTION_TYPES: z.infer<typeof policyTransactionTypeSchema>[] = [
  "swap",
  "transfer",
  "call",
  "withdraw",
];

const STANDARD_POLICY = (signAudiences: string[]): Policy => ({
  version: 1,
  frozen: false,
  capabilities: {
    confidential: { allowed: false, requires_approval: false },
    cross_chain_withdraw: { allowed: false, requires_approval: false },
    evm_sign: { allowed: false, raw_tx: false },
    raw_sign: { allowed: false, chains: [], requires_approval: false },
    sign_message: { allowed: true, requires_approval: false, allowed_recipients: signAudiences },
    swap: { allowed: true, requires_approval: false },
  },
  rules: {
    allowed_tokens: ["*"],
    transaction_types: [...TRANSACTION_TYPES],
  },
});

/**
 * Onboard the session's first agent: `agent_create` is an owner intent
 * (NEP-366) — the wallet signs the policy delegate, the server relays it.
 */
export function CreateAgentDialog({ onCreated }: { onCreated?: () => void }) {
  const apiClient = useAgentsClient();
  const authClient = useAuthClient();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [audience, setAudience] = useState("");

  const create = useMutation({
    mutationFn: async () => {
      const detected = await authClient.near.detectNearAccount();
      if (!detected?.publicKey) {
        throw new Error("No NEAR owner key detected — sign in with your NEAR wallet first");
      }
      const audiences = audience
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean);
      const generated = await apiClient.generateIntent({
        type: "agent_create",
        name,
        owner: {
          type: "near",
          accountId: detected.accountId,
          publicKey: detected.publicKey,
        },
        policy: STANDARD_POLICY(audiences),
      });
      if (!generated || generated.status !== "PENDING_SIGNATURE") {
        throw new Error("Intent generation failed");
      }
      const signedData = await signIntent(authClient, generated.intent);
      await apiClient.submitIntent({
        type: "agent_create",
        correlationId: generated.correlationId,
        signedData,
      });
      return { correlationId: generated.correlationId };
    },
    onSuccess: () => {
      toast.success(`Agent "${name}" created`);
      void queryClient.invalidateQueries({ queryKey: ["agents", "list"] });
      onCreated?.();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div className="flex flex-col gap-3">
      <Field>
        <FieldLabel>Agent name</FieldLabel>
        <Input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="e.g. trading-bot"
          data-testid="agents-create-name"
        />
        <FieldDescription>
          Creates an intents custody wallet operated under your policy — swaps and transfers
          enabled, everything else locked.
        </FieldDescription>
      </Field>
      <Field>
        <FieldLabel>Sign-message audiences (optional)</FieldLabel>
        <Input
          value={audience}
          onChange={(event) => setAudience(event.target.value)}
          placeholder="comma-separated, e.g. app.example.near"
          data-testid="agents-create-audience"
        />
      </Field>
      <Button
        type="button"
        disabled={!name || create.isPending}
        onClick={() => create.mutate()}
        data-testid="agents-create-submit"
      >
        Sign &amp; create agent
      </Button>
    </div>
  );
}

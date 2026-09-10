import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { TransactionBuilder } from "near-kit";
import { useState } from "react";
import { toast } from "sonner";
import { sessionQueryOptions, useApiClient, useAuthClient } from "@/app";
import { useNearAccount } from "@/lib/use-near-account";
import { AppDetailMetadataActions } from "./app-detail-metadata-actions";
import { AppDetailSectionLabel } from "./app-detail-section-label";
import type { RegistryAppDetail, RegistryStatus } from "./app-detail-types";
import { Field, FieldLabel } from "./field";
import { Input } from "./input";
import { Textarea } from "./textarea";

export function AppDetailMetadataEditor({
  accountId,
  gatewayId,
  app,
  statusQuery,
}: {
  accountId: string;
  gatewayId: string;
  app: RegistryAppDetail;
  statusQuery: { data?: RegistryStatus };
}) {
  const queryClient = useQueryClient();
  const apiClient = useApiClient();
  const auth = useAuthClient();
  const { data: session } = useQuery(sessionQueryOptions(auth, undefined));
  const nearAccountId = useNearAccount();
  const user = session?.user;

  const [title, setTitle] = useState(app.metadata?.title ?? "");
  const [description, setDescription] = useState(app.metadata?.description ?? "");
  const [repoUrl, setRepoUrl] = useState(app.metadata?.repoUrl ?? "");
  const [homepageUrl, setHomepageUrl] = useState(app.metadata?.homepageUrl ?? app.openUrl ?? "");
  const [imageUrl, setImageUrl] = useState(app.metadata?.imageUrl ?? "");
  const [delegatePayload, setDelegatePayload] = useState<string | null>(null);

  const refreshQueries = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["app", accountId, gatewayId] }),
      queryClient.invalidateQueries({ queryKey: ["apps-account", accountId] }),
      queryClient.invalidateQueries({ queryKey: ["apps"] }),
    ]);
  };

  const prepareMetadataMutation = useMutation({
    mutationFn: async () => {
      if (!nearAccountId) throw new Error("Connect a NEAR wallet to publish metadata.");
      return apiClient.apps.prepareRegistryMetadataWrite({
        accountId,
        gatewayId,
        claimedBy: nearAccountId,
        title: title.trim() || undefined,
        description: description.trim() || undefined,
        repoUrl: repoUrl.trim() || undefined,
        homepageUrl: homepageUrl.trim() || undefined,
        imageUrl: imageUrl.trim() || undefined,
      });
    },
  });

  const publishMutation = useMutation({
    mutationFn: async () => {
      const prepared = await prepareMetadataMutation.mutateAsync();
      const signed = await auth.near.buildSignedDelegateAction(
        prepared.data.contractId,
        (builder: TransactionBuilder, receiverId: string) =>
          builder.functionCall(receiverId, prepared.data.methodName, prepared.data.args, {
            gas: "10000000000000",
            attachedDeposit: 0n,
          }),
      );
      const result = await auth.near.relayTransaction({ payload: signed });
      if (result.error) throw new Error(result.error.message || "Relay failed");
      return result.data;
    },
    onSuccess: async (result) => {
      setDelegatePayload(null);
      toast.success("Metadata submitted", {
        description: result?.txHash ? `tx: ${result.txHash}` : "Indexing may take a moment.",
      });
      await refreshQueries();
    },
    onError: (err: Error) => toast.error(err.message || "Failed to publish"),
  });

  const signDelegateMutation = useMutation({
    mutationFn: async () => {
      const prepared = await prepareMetadataMutation.mutateAsync();
      return auth.near.buildSignedDelegateAction(
        prepared.data.contractId,
        (builder: TransactionBuilder, receiverId: string) =>
          builder.functionCall(receiverId, prepared.data.methodName, prepared.data.args, {
            gas: "10000000000000",
            attachedDeposit: 0n,
          }),
      );
    },
    onSuccess: (payload: string) => {
      setDelegatePayload(payload);
      toast.success("Payload signed — relay below or copy to submit elsewhere.");
    },
    onError: (err: Error) => toast.error(err.message || "Failed to sign"),
  });

  const relayMutation = useMutation({
    mutationFn: async () => {
      if (!delegatePayload) throw new Error("Sign a payload first.");
      const result = await auth.near.relayTransaction({ payload: delegatePayload });
      if (result.error) throw new Error(result.error.message || "Relay failed");
      return result.data;
    },
    onSuccess: async (result) => {
      toast.success("Relayed", {
        description: result?.txHash ? `tx: ${result.txHash}` : undefined,
      });
      await refreshQueries();
    },
    onError: (err: Error) => toast.error(err.message || "Relay failed"),
  });

  return (
    <section className="space-y-3">
      <AppDetailSectionLabel>Claim / Edit Metadata</AppDetailSectionLabel>
      {!user ? (
        <p className="text-sm text-muted-foreground">
          Sign in and link a NEAR wallet to publish metadata for this app.
        </p>
      ) : !nearAccountId ? (
        <p className="text-sm text-muted-foreground">
          No NEAR wallet linked. Open settings to connect one.
        </p>
      ) : (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="meta-title">Title</FieldLabel>
              <Input
                id="meta-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="App title"
                className="h-9 text-sm"
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="meta-repo">Repo URL</FieldLabel>
              <Input
                id="meta-repo"
                value={repoUrl}
                onChange={(event) => setRepoUrl(event.target.value)}
                placeholder="https://github.com/..."
                className="h-9 text-sm"
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="meta-homepage">Homepage URL</FieldLabel>
              <Input
                id="meta-homepage"
                value={homepageUrl}
                onChange={(event) => setHomepageUrl(event.target.value)}
                placeholder="https://..."
                className="h-9 text-sm"
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="meta-image">Image URL</FieldLabel>
              <Input
                id="meta-image"
                value={imageUrl}
                onChange={(event) => setImageUrl(event.target.value)}
                placeholder="https://..."
                className="h-9 text-sm"
              />
            </Field>
          </div>
          <Field>
            <FieldLabel htmlFor="meta-desc">Description</FieldLabel>
            <Textarea
              id="meta-desc"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={3}
              placeholder="Short description"
              className="text-sm"
            />
          </Field>

          <AppDetailMetadataActions
            publish={publishMutation}
            sign={signDelegateMutation}
            relay={relayMutation}
            relayEnabled={statusQuery.data?.relayEnabled}
            delegatePayload={delegatePayload}
          />

          <p className="text-xs text-muted-foreground">
            Direct publish uses <code className="font-mono">waitUntil: NONE</code>. The wallet may
            report failure while FastKV still indexes the transaction successfully.
          </p>
        </div>
      )}
    </section>
  );
}

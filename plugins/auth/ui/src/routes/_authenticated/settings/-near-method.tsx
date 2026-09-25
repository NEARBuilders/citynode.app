import { WalletIcon } from "@phosphor-icons/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { sessionQueryKey, useAuthClient } from "everything-dev/ui/auth";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item";
import { MethodHeader } from "./-method-header";

export function NearMethod({ nearAccountId }: { nearAccountId: string | null }) {
  const auth = useAuthClient();
  const queryClient = useQueryClient();

  const linkNearMutation = useMutation({
    mutationFn: async () => {
      const result: unknown = await auth.signIn.near();
      if (
        result &&
        typeof result === "object" &&
        "error" in result &&
        result.error &&
        typeof result.error === "object" &&
        "message" in result.error
      ) {
        throw new Error(String(result.error.message));
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: sessionQueryKey });
      void queryClient.invalidateQueries({ queryKey: ["user-invitations"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <section className="flex flex-col gap-4" data-testid="settings.near-wallet">
      <MethodHeader title="NEAR wallet" description="Sign in and sign transactions with NEAR." />
      <Item variant="outline">
        <ItemMedia variant="icon">
          <WalletIcon />
        </ItemMedia>
        <ItemContent>
          <ItemTitle>{nearAccountId ? "Connected" : "No wallet connected"}</ItemTitle>
          <ItemDescription>
            {nearAccountId ? (
              <span className="break-all font-mono">{nearAccountId}</span>
            ) : (
              "Connect a wallet to stake and publish."
            )}
          </ItemDescription>
        </ItemContent>
        <ItemActions>
          {nearAccountId ? (
            <Badge variant="success">Linked</Badge>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={() => linkNearMutation.mutate()}
              disabled={linkNearMutation.isPending}
              data-testid="settings.connect-near-button"
            >
              {linkNearMutation.isPending ? "Connecting…" : "Connect wallet"}
            </Button>
          )}
        </ItemActions>
      </Item>
    </section>
  );
}

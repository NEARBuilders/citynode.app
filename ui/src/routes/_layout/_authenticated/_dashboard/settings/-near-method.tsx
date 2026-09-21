import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Wallet } from "lucide-react";
import { toast } from "sonner";
import { sessionQueryKey, useAuthClient } from "@/app";
import { Button, Card, Chip } from "@/components";

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
      queryClient.invalidateQueries({ queryKey: sessionQueryKey });
      queryClient.invalidateQueries({ queryKey: ["user-invitations"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <Card className="p-6 space-y-4">
      <div className="flex items-start gap-4">
        <div className="w-10 h-10 rounded-[10px] border-2 border-outset border-border-strong bg-muted flex items-center justify-center shrink-0">
          <Wallet className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-base font-semibold text-foreground">NEAR Wallet</span>
            <Chip muted={!nearAccountId}>{nearAccountId ? "linked" : "not linked"}</Chip>
          </div>
          {nearAccountId ? (
            <div className="rounded-[8px] border border-border bg-muted px-3 py-2 font-mono text-xs break-all text-foreground">
              {nearAccountId}
            </div>
          ) : (
            <div className="flex items-center gap-3 pt-1">
              <Button
                onClick={() => linkNearMutation.mutate()}
                disabled={linkNearMutation.isPending}
                variant="outline"
              >
                {linkNearMutation.isPending ? "connecting..." : "connect NEAR wallet"}
              </Button>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

import { KeyIcon } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type Passkey, useAuthClient } from "everything-dev/ui/auth";
import { useState } from "react";
import { toast } from "sonner";
import { Button, Card, Chip, ConfirmDialog, Input } from "@/components";

const passkeyQueryKey = ["passkeys"] as const;

export function PasskeysMethod() {
  const auth = useAuthClient();
  const queryClient = useQueryClient();

  const { data: passkeys = [] } = useQuery({
    queryKey: passkeyQueryKey,
    queryFn: async () => {
      const { data } = await auth.passkey.listUserPasskeys();
      return (data || []) as Passkey[];
    },
    staleTime: 60 * 1000,
  });

  const [passkeyName, setPasskeyName] = useState("");
  const [passkeyToDelete, setPasskeyToDelete] = useState<Passkey | null>(null);

  const addPasskeyMutation = useMutation({
    mutationFn: async () => {
      const name = passkeyName.trim();
      const { error } = name
        ? await auth.passkey.addPasskey({ name })
        : await auth.passkey.addPasskey();
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      setPasskeyName("");
      toast.success("Passkey added");
      void queryClient.invalidateQueries({ queryKey: passkeyQueryKey });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const removePasskeyMutation = useMutation({
    mutationFn: async (passkeyId: string) => {
      const { error } = await auth.passkey.deletePasskey({ id: passkeyId });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      setPasskeyToDelete(null);
      toast.success("Passkey removed");
      void queryClient.invalidateQueries({ queryKey: passkeyQueryKey });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <>
      <Card className="p-6 space-y-4">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center shrink-0">
            <KeyIcon className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="min-w-0 flex-1 space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-base font-semibold text-foreground">Passkeys</span>
              <Chip muted={passkeys.length === 0}>
                {passkeys.length > 0 ? `${passkeys.length} registered` : "not linked"}
              </Chip>
            </div>

            {passkeys.length > 0 && (
              <div className="flex flex-col gap-2">
                {passkeys.map((passkey) => (
                  <div
                    key={passkey.id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted px-3.5 py-2.5"
                  >
                    <span className="text-sm text-foreground truncate min-w-0 flex-1">
                      {passkey.name || "Passkey"}
                    </span>
                    <Button
                      onClick={() => setPasskeyToDelete(passkey)}
                      disabled={removePasskeyMutation.isPending}
                      variant="outline"
                    >
                      remove
                    </Button>
                  </div>
                ))}
              </div>
            )}

            <div className="flex gap-2">
              <Input
                type="text"
                value={passkeyName}
                onChange={(e) => setPasskeyName(e.target.value)}
                placeholder="Passkey name, e.g. Work laptop"
                className="max-w-xs"
              />
              <Button
                onClick={() => addPasskeyMutation.mutate()}
                disabled={addPasskeyMutation.isPending}
                variant="outline"
              >
                {addPasskeyMutation.isPending ? "adding..." : "add passkey"}
              </Button>
            </div>
          </div>
        </div>
      </Card>

      <ConfirmDialog
        open={!!passkeyToDelete}
        onOpenChange={(open: boolean) => {
          if (!open) setPasskeyToDelete(null);
        }}
        title="Remove passkey"
        description={`Remove ${passkeyToDelete?.name || "this passkey"} from your account? You will no longer be able to use it to sign in.`}
        confirmLabel="remove"
        variant="destructive"
        onConfirm={() => {
          if (passkeyToDelete) removePasskeyMutation.mutate(passkeyToDelete.id);
        }}
        isPending={removePasskeyMutation.isPending}
      />
    </>
  );
}

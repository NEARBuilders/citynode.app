import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { type ApiClient, useApiClient } from "@/app";
import {
  Button,
  Card,
  ConfirmDialog,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  NodeValidatorTable,
  SectionHeader,
} from "@/components";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { invalidateNodeQueries } from "@/lib/queries/nodes";

type Validator = Awaited<ReturnType<ApiClient["getNodeSummary"]>>["validators"][number];

export function NodeValidators({
  nodeId,
  validators,
}: {
  nodeId: string;
  validators: Validator[];
}) {
  const apiClient = useApiClient();
  const queryClient = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<Validator | null>(null);
  const mutation = useMutation({
    mutationFn: async ({
      validator,
      action,
    }: {
      validator: Validator;
      action: "remove" | "default";
    }) => {
      if (action === "remove") await apiClient.deleteValidator({ validatorId: validator.id });
      else await apiClient.setDefaultValidator({ validatorId: validator.id });
    },
    onSuccess: async (_, { action }) => {
      await invalidateNodeQueries(queryClient);
      setRemoving(null);
      toast.success(action === "remove" ? "Validator removed" : "Default validator updated");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <section className="space-y-3">
      <SectionHeader
        title="Validators"
        action={
          <Button variant="outline" size="sm" onClick={() => setAdding(true)}>
            <Plus /> add validator
          </Button>
        }
      />
      <Card className="overflow-hidden">
        {validators.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">
            No validators are attached to this node.
          </p>
        ) : (
          <NodeValidatorTable
            validators={validators}
            renderActions={(validator) => (
              <div className="flex gap-2">
                {!validator.isDefault && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={mutation.isPending}
                    onClick={() => mutation.mutate({ validator, action: "default" })}
                  >
                    set default
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={mutation.isPending}
                  onClick={() => setRemoving(validator)}
                >
                  remove
                </Button>
              </div>
            )}
          />
        )}
      </Card>
      <Dialog open={adding} onOpenChange={setAdding}>
        {adding && <AddValidatorForm nodeId={nodeId} onClose={() => setAdding(false)} />}
      </Dialog>
      <ConfirmDialog
        open={!!removing}
        onOpenChange={(open) => {
          if (!open) setRemoving(null);
        }}
        title="Remove validator?"
        description={`Remove ${removing?.accountId ?? "this validator"} from this node? Staking resolution may change.`}
        variant="destructive"
        confirmLabel="remove validator"
        isPending={mutation.isPending}
        onConfirm={() => {
          if (removing) mutation.mutate({ validator: removing, action: "remove" });
        }}
      />
    </section>
  );
}

function AddValidatorForm({ nodeId, onClose }: { nodeId: string; onClose: () => void }) {
  const apiClient = useApiClient();
  const queryClient = useQueryClient();
  const [accountId, setAccountId] = useState("");
  const [network, setNetwork] = useState("mainnet");
  const [protocol, setProtocol] = useState("near");
  const [role, setRole] = useState<Validator["role"]>("community");
  const [isDefault, setIsDefault] = useState(false);
  const mutation = useMutation({
    mutationFn: () =>
      apiClient.createValidator({
        nodeId,
        accountId: accountId.trim(),
        network: network.trim(),
        protocol: protocol.trim(),
        role,
        isDefault,
      }),
    onSuccess: async () => {
      await invalidateNodeQueries(queryClient);
      toast.success("Validator added");
      onClose();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  return (
    <DialogContent className="max-h-[90dvh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>Add validator</DialogTitle>
        <DialogDescription>Attach a validator account to this node.</DialogDescription>
      </DialogHeader>
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          mutation.mutate();
        }}
      >
        <div className="space-y-2">
          <Label htmlFor="validator-account">Account ID</Label>
          <Input
            id="validator-account"
            value={accountId}
            onChange={(event) => setAccountId(event.target.value)}
            placeholder="everything.pool.near"
            required
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="validator-network">Network</Label>
            <Input
              id="validator-network"
              value={network}
              onChange={(event) => setNetwork(event.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="validator-protocol">Protocol</Label>
            <Input
              id="validator-protocol"
              value={protocol}
              onChange={(event) => setProtocol(event.target.value)}
              required
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="validator-role">Role</Label>
          <Select
            value={role}
            onValueChange={(value) => setRole(value === "official" ? "official" : "community")}
          >
            <SelectTrigger id="validator-role" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="community">Community</SelectItem>
              <SelectItem value="official">Official</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <Checkbox
            id="validator-default"
            checked={isDefault}
            onCheckedChange={(checked) => setIsDefault(checked === true)}
          />
          <Label htmlFor="validator-default">Set as this node's default validator</Label>
        </div>
        {mutation.isError && (
          <p role="alert" className="text-sm text-destructive">
            {mutation.error.message}
          </p>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={mutation.isPending}>
            cancel
          </Button>
          <Button
            type="submit"
            disabled={
              mutation.isPending || !accountId.trim() || !network.trim() || !protocol.trim()
            }
          >
            {mutation.isPending ? "adding..." : "add validator"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

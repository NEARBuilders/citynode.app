import { PlusIcon } from "@phosphor-icons/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
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
  Field,
  FieldLabel,
  Input,
  NodeValidatorTable,
  SectionHeader,
} from "@/components";
import { Checkbox } from "@/components/ui/checkbox";
import { FieldGroup } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { invalidateNodeQueries } from "@/lib/queries/nodes";

type Validator = Awaited<ReturnType<ApiClient["getNodeSummary"]>>["validators"][number];

const VALIDATOR_ROLE_ITEMS = [
  { label: "Community", value: "community" },
  { label: "Official", value: "official" },
];

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
            <PlusIcon /> add validator
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
    <DialogContent className="max-h-11/12 overflow-y-auto">
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
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="validator-account">Account ID</FieldLabel>
            <Input
              id="validator-account"
              value={accountId}
              onChange={(event) => setAccountId(event.target.value)}
              placeholder="everything.pool.near"
              required
              className="font-mono"
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="validator-network">Network</FieldLabel>
              <Input
                id="validator-network"
                value={network}
                onChange={(event) => setNetwork(event.target.value)}
                required
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="validator-protocol">Protocol</FieldLabel>
              <Input
                id="validator-protocol"
                value={protocol}
                onChange={(event) => setProtocol(event.target.value)}
                required
              />
            </Field>
          </div>
          <Field>
            <FieldLabel htmlFor="validator-role">Role</FieldLabel>
            <Select
              value={role}
              items={VALIDATOR_ROLE_ITEMS}
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
          </Field>
          <Field orientation="horizontal">
            <Checkbox
              id="validator-default"
              checked={isDefault}
              onCheckedChange={(checked) => setIsDefault(checked === true)}
            />
            <FieldLabel htmlFor="validator-default">
              Set as this node's default validator
            </FieldLabel>
          </Field>
        </FieldGroup>
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

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { sessionQueryKey, sessionQueryOptions, useAuthClient } from "everything-dev/ui/auth";
import { useState } from "react";
import { toast } from "sonner";
import { Button, Card, InfoRow, Input } from "@/components";

export function ProfileSettings() {
  const auth = useAuthClient();
  const { data: session } = useQuery(sessionQueryOptions(auth));
  const user = session?.user;

  if (!user) return null;

  return (
    <div className="space-y-4">
      <IdentityCard user={user} />
      {user.isAnonymous && (
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">
            This session is temporary. Link an email or NEAR wallet before signing out if you want
            the account to remain recoverable.
          </p>
        </Card>
      )}
    </div>
  );
}

function IdentityCard({
  user,
}: {
  user: { id: string; email?: string; name?: string; isAnonymous?: boolean | null };
}) {
  const auth = useAuthClient();
  const queryClient = useQueryClient();
  const [name, setName] = useState(user.name || "");

  const updateMutation = useMutation({
    mutationFn: async () => {
      const { error } = await auth.updateUser({ name });
      if (error) throw new Error(error.message);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: sessionQueryKey });
      toast.success("Profile updated");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <Card className="p-6 space-y-4">
      <div className="text-sm font-medium text-muted-foreground">Identity</div>
      <div className="flex flex-col gap-2">
        <InfoRow label="user id" value={user.id} mono />
        <InfoRow label="email" value={user.email ?? "not linked"} />
        <InfoRow label="account type" value={user.isAnonymous ? "anonymous" : "standard"} />
      </div>
      <div className="space-y-2">
        <div className="text-sm font-medium text-muted-foreground">Display name</div>
        <div className="flex gap-2">
          <Input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your display name"
            className="max-w-sm"
          />
          <Button
            onClick={() => updateMutation.mutate()}
            disabled={updateMutation.isPending || name === (user.name || "")}
            variant="outline"
          >
            {updateMutation.isPending ? "saving..." : "save"}
          </Button>
        </div>
      </div>
    </Card>
  );
}

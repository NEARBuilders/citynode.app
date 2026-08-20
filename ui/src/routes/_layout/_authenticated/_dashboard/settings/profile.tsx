import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { sessionQueryOptions, useAuthClient } from "@/app";
import { Button, Card, InfoRow, Input } from "@/components";

export const Route = createFileRoute("/_layout/_authenticated/_dashboard/settings/profile")({
  component: ProfileSettings,
});

function ProfileSettings() {
  const auth = useAuthClient();
  const { data: session } = useQuery(sessionQueryOptions(auth));
  const user = session?.user;

  if (!user) return null;

  return (
    <div className="space-y-4">
      <IdentityCard user={user} />
      {user.isAnonymous && (
        <Card className="p-4 text-sm text-muted-foreground leading-relaxed">
          This session is temporary. Link an email or NEAR wallet before signing out if you want the
          account to remain recoverable.
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
  const [name, setName] = useState(user.name || "");

  const updateMutation = useMutation({
    mutationFn: async () => {
      const { error } = await auth.updateUser({ name });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => toast.success("Profile updated"),
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <Card className="p-6 space-y-4">
      <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
        Identity
      </div>
      <div className="flex flex-col gap-2">
        <InfoRow label="user id" value={user.id} mono />
        <InfoRow label="email" value={user.email ?? "not linked"} />
        <InfoRow label="account type" value={user.isAnonymous ? "anonymous" : "standard"} />
      </div>
      <div className="space-y-2">
        <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
          Display name
        </div>
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

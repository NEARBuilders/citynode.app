import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useAuthClient } from "everything-dev/ui/auth";
import { useState } from "react";
import { toast } from "sonner";
import { Button, Card, Field, FieldLabel, Input } from "@/components";
import { clearAuthenticatedQueries } from "@/lib/session-cache";
import { ActionCard } from "./-action-card";

export function SecurityTab({ user }: { user: { email?: string; isAnonymous?: boolean | null } }) {
  const auth = useAuthClient();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const changePasswordMutation = useMutation({
    mutationFn: () => {
      if (newPassword !== confirmPassword) throw new Error("Passwords do not match");
      if (newPassword.length < 8) throw new Error("Password must be at least 8 characters");
      return (async () => {
        const { error } = await auth.changePassword({ currentPassword, newPassword });
        if (error) throw new Error(error.message);
      })();
    },
    onSuccess: () => {
      toast.success("Password changed");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const revokeSessionsMutation = useMutation({
    mutationFn: async () => {
      const { error } = await auth.revokeOtherSessions();
      if (error) throw new Error(error.message);
    },
    onSuccess: () => toast.success("Other sessions revoked"),
    onError: (err: Error) => toast.error(err.message),
  });

  const signOutMutation = useMutation({
    mutationFn: async () => {
      const { error } = await auth.signOut();
      if (error) throw new Error(error.message || "Failed to sign out");
      await auth.near.disconnect().catch(() => {});
    },
    onSuccess: async () => {
      await clearAuthenticatedQueries(queryClient);
      await navigate({ to: "/", replace: true });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <div className="space-y-4">
      {user.email ? (
        <Card className="p-6 space-y-4">
          <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            Change password
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            <Field>
              <FieldLabel>current</FieldLabel>
              <Input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Current password"
              />
            </Field>
            <Field>
              <FieldLabel>new</FieldLabel>
              <Input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="New password"
              />
            </Field>
            <Field>
              <FieldLabel>confirm</FieldLabel>
              <Input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm password"
              />
            </Field>
          </div>
          <Button
            onClick={() => changePasswordMutation.mutate()}
            disabled={
              changePasswordMutation.isPending ||
              !currentPassword ||
              !newPassword ||
              !confirmPassword
            }
            variant="outline"
          >
            {changePasswordMutation.isPending ? "changing..." : "change password"}
          </Button>
        </Card>
      ) : (
        <Card className="p-6 text-sm text-muted-foreground">
          Password management appears once an email-based login is attached to this account.
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <ActionCard
          title="revoke other sessions"
          body="End every other active session while keeping this one open."
          actionLabel={revokeSessionsMutation.isPending ? "revoking..." : "revoke sessions"}
          onClick={() => revokeSessionsMutation.mutate()}
          disabled={revokeSessionsMutation.isPending}
        />
        <ActionCard
          title="sign out"
          body="Disconnect this session and return to the public landing page."
          actionLabel={signOutMutation.isPending ? "signing out..." : "sign out"}
          onClick={() => signOutMutation.mutate()}
          disabled={signOutMutation.isPending}
        />
      </div>
    </div>
  );
}

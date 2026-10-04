import { DevicesIcon, LockIcon, SignOutIcon } from "@phosphor-icons/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { clearAuthenticatedQueries, useAuthClient } from "everything-dev/ui/auth";
import { type FormEvent, useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { SectionHeader } from "@/components/layout/section-header";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item";
import { authErrorMessage, LoginActionError } from "@/i18n/error-message";
import { useLoginTranslation } from "@/i18n/runtime";
import { isSyntheticEmail } from "@/lib/synthetic-email";

export function SecurityTab({ user }: { user: { email?: string; isAnonymous?: boolean | null } }) {
  const translate = useLoginTranslation();
  const auth = useAuthClient();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [changingPassword, setChangingPassword] = useState(false);
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const changePasswordMutation = useMutation({
    mutationFn: () => {
      if (newPassword !== confirmPassword)
        throw new LoginActionError("auth.error.passwordMismatch");
      if (newPassword.length < 8) throw new LoginActionError("auth.error.passwordLength");
      return (async () => {
        const { error } = await auth.changePassword({ currentPassword, newPassword });
        if (error) throw new Error(error.message);
      })();
    },
    onSuccess: () => {
      toast.success(translate("auth.security.passwordChanged"));
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setChangingPassword(false);
    },
    onError: (err: Error) => toast.error(authErrorMessage(err, translate)),
  });

  const revokeSessionsMutation = useMutation({
    mutationFn: async () => {
      const { error } = await auth.revokeOtherSessions();
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      setConfirmRevoke(false);
      toast.success(translate("auth.security.sessionsRevoked"));
    },
    onError: (err: Error) => toast.error(authErrorMessage(err, translate)),
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
    onError: (err: Error) => toast.error(authErrorMessage(err, translate)),
  });

  const handlePasswordSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    changePasswordMutation.mutate();
  };

  const hasPassword = !!user.email && !user.isAnonymous && !isSyntheticEmail(user.email);

  return (
    <section className="flex flex-col gap-6">
      <SectionHeader
        title={translate("auth.settings.security")}
        description={translate("auth.security.description")}
        sectionTestId="settings.security-heading"
      />
      <ItemGroup>
        {hasPassword && (
          <Item variant="outline" size="sm" role="listitem">
            <ItemMedia variant="icon">
              <LockIcon />
            </ItemMedia>
            <ItemContent>
              <ItemTitle>{translate("auth.security.password")}</ItemTitle>
              <ItemDescription className="wrap-anywhere">
                {translate("auth.security.passwordEmail", { email: user.email })}
              </ItemDescription>
            </ItemContent>
            <ItemActions className="w-full sm:w-auto">
              <Button
                variant="outline"
                className="w-full sm:w-auto"
                onClick={() => setChangingPassword(true)}
                data-testid="settings.change-password-button"
              >
                {translate("auth.security.changePassword")}
              </Button>
            </ItemActions>
          </Item>
        )}
        <Item variant="outline" size="sm" role="listitem">
          <ItemMedia variant="icon">
            <DevicesIcon />
          </ItemMedia>
          <ItemContent>
            <ItemTitle>{translate("auth.security.otherDevices")}</ItemTitle>
            <ItemDescription>{translate("auth.security.signOutOthersHint")}</ItemDescription>
          </ItemContent>
          <ItemActions className="w-full sm:w-auto">
            <Button
              variant="outline"
              className="w-full sm:w-auto"
              onClick={() => setConfirmRevoke(true)}
              disabled={revokeSessionsMutation.isPending}
              data-testid="settings.revoke-sessions-button"
            >
              {translate("auth.security.signOutOthers")}
            </Button>
          </ItemActions>
        </Item>
        <Item variant="outline" size="sm" role="listitem">
          <ItemMedia variant="icon">
            <SignOutIcon />
          </ItemMedia>
          <ItemContent>
            <ItemTitle>{translate("auth.security.thisDevice")}</ItemTitle>
            <ItemDescription>{translate("auth.security.signOutHint")}</ItemDescription>
          </ItemContent>
          <ItemActions className="w-full sm:w-auto">
            <Button
              variant="ghost"
              className="w-full sm:w-auto"
              onClick={() => signOutMutation.mutate()}
              disabled={signOutMutation.isPending}
              data-testid="settings.signout-button"
            >
              {signOutMutation.isPending
                ? translate("auth.identity.signingOut")
                : translate("auth.identity.signOut")}
            </Button>
          </ItemActions>
        </Item>
      </ItemGroup>

      <Dialog open={changingPassword} onOpenChange={setChangingPassword}>
        <DialogContent>
          <form onSubmit={handlePasswordSubmit} className="flex flex-col gap-6">
            <DialogHeader>
              <DialogTitle>{translate("auth.security.changePassword")}</DialogTitle>
              <DialogDescription>{translate("auth.error.passwordLength")}</DialogDescription>
            </DialogHeader>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="settings-current-password">
                  {translate("auth.security.currentPassword")}
                </FieldLabel>
                <Input
                  id="settings-current-password"
                  type="password"
                  autoComplete="current-password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="settings-new-password">
                  {translate("auth.security.newPassword")}
                </FieldLabel>
                <Input
                  id="settings-new-password"
                  type="password"
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="settings-confirm-password">
                  {translate("auth.security.confirmPassword")}
                </FieldLabel>
                <Input
                  id="settings-confirm-password"
                  type="password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                />
              </Field>
            </FieldGroup>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setChangingPassword(false)}>
                {translate("auth.common.cancel")}
              </Button>
              <Button
                type="submit"
                disabled={
                  changePasswordMutation.isPending ||
                  !currentPassword ||
                  !newPassword ||
                  !confirmPassword
                }
              >
                {changePasswordMutation.isPending
                  ? translate("auth.common.updating")
                  : translate("auth.security.updatePassword")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmRevoke}
        onOpenChange={setConfirmRevoke}
        title={translate("auth.security.revokeTitle")}
        description={translate("auth.security.revokeDescription")}
        confirmLabel={translate("auth.security.signOutDevices")}
        cancelLabel={translate("auth.common.cancel")}
        variant="destructive"
        onConfirm={() => revokeSessionsMutation.mutate()}
        isPending={revokeSessionsMutation.isPending}
      />
    </section>
  );
}

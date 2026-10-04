import { CopyIcon, EnvelopeIcon, WarningIcon } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { sessionQueryKey, sessionQueryOptions, useAuthClient } from "everything-dev/ui/auth";
import { type FormEvent, useState } from "react";
import { toast } from "sonner";
import { AddEmailDialog } from "@/components/add-email-dialog";
import { SectionHeader } from "@/components/layout/section-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { InfoRow } from "@/components/ui/info-row";
import { Input } from "@/components/ui/input";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item";
import { authErrorMessage } from "@/i18n/error-message";
import { LoginLanguageSelector } from "@/i18n/language-selector";
import { useLoginTranslation } from "@/i18n/runtime";
import { isSyntheticEmail } from "@/lib/synthetic-email";

type ProfileUser = {
  id: string;
  email?: string;
  name?: string;
  isAnonymous?: boolean | null;
  locale?: string | null;
};

export function ProfileSettings() {
  const translate = useLoginTranslation();
  const auth = useAuthClient();
  const { data: session } = useQuery(sessionQueryOptions(auth));
  const user = session?.user;
  const [addEmailOpen, setAddEmailOpen] = useState(false);

  if (!user) return null;

  const emailIsSynthetic = isSyntheticEmail(user.email);
  const showAddEmailPrompt = !user.isAnonymous && emailIsSynthetic;

  return (
    <>
      <section className="flex flex-col gap-6">
        <SectionHeader
          title={translate("auth.settings.profile")}
          description={translate("auth.profile.description")}
          sectionTestId="settings.profile-heading"
        />
        {user.isAnonymous && (
          <Item variant="muted" data-testid="settings.temporary-account">
            <ItemMedia variant="icon">
              <WarningIcon />
            </ItemMedia>
            <ItemContent>
              <ItemTitle>{translate("auth.profile.temporaryAccount")}</ItemTitle>
              <ItemDescription>{translate("auth.profile.recoverHint")}</ItemDescription>
            </ItemContent>
            <ItemActions className="w-full sm:w-auto">
              <Button
                variant="outline"
                className="w-full sm:w-auto"
                nativeButton={false}
                render={<Link to="/settings/auth-methods" />}
              >
                {translate("auth.profile.addMethod")}
              </Button>
            </ItemActions>
          </Item>
        )}
        {showAddEmailPrompt && (
          <Item variant="muted" data-testid="settings.add-email-prompt">
            <ItemMedia variant="icon">
              <EnvelopeIcon />
            </ItemMedia>
            <ItemContent>
              <ItemTitle>{translate("auth.email.add")}</ItemTitle>
              <ItemDescription>{translate("auth.profile.emailHint")}</ItemDescription>
            </ItemContent>
            <ItemActions className="w-full sm:w-auto">
              <Button
                className="w-full sm:w-auto"
                onClick={() => setAddEmailOpen(true)}
                data-testid="settings.add-email-button"
              >
                {translate("auth.email.add")}
              </Button>
            </ItemActions>
          </Item>
        )}
        <DisplayNameForm key={user.name ?? ""} user={user} />
      </section>
      <LanguageSettings />
      <AccountDetails user={user} onAddEmail={() => setAddEmailOpen(true)} />
      <AddEmailDialog open={addEmailOpen} onOpenChange={setAddEmailOpen} />
    </>
  );
}

function LanguageSettings() {
  const translate = useLoginTranslation();

  return (
    <section className="flex flex-col gap-6">
      <SectionHeader
        title={translate("auth.locale.title")}
        description={translate("auth.locale.description")}
      />
      <div className="max-w-md">
        <Field>
          <FieldLabel htmlFor="settings-language">{translate("auth.locale.display")}</FieldLabel>
          <LoginLanguageSelector
            id="settings-language"
            testId="settings.language-select"
            size="default"
            className="w-full"
          />
          <FieldDescription>{translate("auth.locale.saved")}</FieldDescription>
        </Field>
      </div>
    </section>
  );
}

function DisplayNameForm({ user }: { user: ProfileUser }) {
  const translate = useLoginTranslation();
  const auth = useAuthClient();
  const queryClient = useQueryClient();
  const [name, setName] = useState(user.name || "");

  const updateMutation = useMutation({
    mutationFn: async () => {
      const { error } = await auth.updateUser({ name: name.trim() });
      if (error) throw new Error(error.message);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: sessionQueryKey });
      toast.success(translate("auth.profile.updated"));
    },
    onError: (err: Error) => toast.error(authErrorMessage(err, translate)),
  });

  const unchanged = name.trim() === (user.name || "");

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (unchanged || !name.trim()) return;
    updateMutation.mutate();
  };

  return (
    <form onSubmit={handleSubmit} className="max-w-md">
      <Field>
        <FieldLabel htmlFor="settings-display-name">
          {translate("auth.profile.displayName")}
        </FieldLabel>
        <div className="flex gap-2">
          <Input
            id="settings-display-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={translate("auth.profile.displayNameExample")}
            autoComplete="name"
            maxLength={64}
            className="flex-1"
            data-testid="settings.display-name-input"
          />
          <Button
            type="submit"
            disabled={updateMutation.isPending || unchanged || !name.trim()}
            data-testid="settings.display-name-save"
          >
            {updateMutation.isPending
              ? translate("auth.common.saving")
              : translate("auth.common.save")}
          </Button>
        </div>
        <FieldDescription>{translate("auth.profile.displayNameHint")}</FieldDescription>
      </Field>
    </form>
  );
}

function AccountDetails({ user, onAddEmail }: { user: ProfileUser; onAddEmail: () => void }) {
  const translate = useLoginTranslation();
  const copyId = async () => {
    try {
      await navigator.clipboard.writeText(user.id);
      toast.success(translate("auth.profile.idCopied"));
    } catch {
      toast.error(translate("auth.common.copyFailed"));
    }
  };

  const emailIsSynthetic = isSyntheticEmail(user.email);
  const emailValue: React.ReactNode =
    emailIsSynthetic || user.isAnonymous ? (
      <span className="inline-flex items-center gap-2">
        <span className="text-muted-foreground">{translate("auth.common.notLinked")}</span>
        {!user.isAnonymous && (
          <Button
            variant="link"
            size="xs"
            onClick={onAddEmail}
            data-testid="settings.account-add-email"
          >
            {translate("auth.common.add")}
          </Button>
        )}
      </span>
    ) : (
      <span className="inline-flex max-w-full items-center gap-2">
        <span className="min-w-0 truncate">{user.email}</span>
      </span>
    );

  return (
    <section className="flex flex-col gap-6">
      <SectionHeader title={translate("auth.common.account")} />
      <div className="flex flex-col">
        <InfoRow label={translate("auth.common.email")} value={emailValue} />
        <InfoRow
          label={translate("auth.profile.accountType")}
          value={
            user.isAnonymous ? (
              <Badge variant="warning">{translate("auth.profile.temporary")}</Badge>
            ) : (
              <Badge variant="secondary">{translate("auth.profile.standard")}</Badge>
            )
          }
        />
        <InfoRow
          label={translate("auth.profile.id")}
          mono
          value={
            <span className="inline-flex max-w-full items-center gap-2">
              <span className="min-w-0 text-muted-foreground">{user.id}</span>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => void copyId()}
                aria-label={translate("auth.profile.copyId")}
              >
                <CopyIcon />
              </Button>
            </span>
          }
        />
      </div>
    </section>
  );
}

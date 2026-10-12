import { useMutation, useQueryClient } from "@tanstack/react-query";
import { refreshSessionCache, useAuthClient } from "everything-dev/ui/auth";
import { type FormEvent, useEffect, useState } from "react";
import { toast } from "sonner";
import type { LoginMessageId } from "@/i18n/catalogs";
import { useLoginTranslation } from "@/i18n/runtime";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Field, FieldDescription, FieldError, FieldLabel } from "./ui/field";
import { Input } from "./ui/input";

interface AddEmailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const CODE_LENGTH = 6;

export function AddEmailDialog({ open, onOpenChange }: AddEmailDialogProps) {
  const translate = useLoginTranslation();
  const auth = useAuthClient();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const [error, setError] = useState<LoginMessageId | null>(null);

  useEffect(() => {
    if (open) {
      setEmail("");
      setCode("");
      setPendingEmail(null);
      setError(null);
    }
  }, [open]);

  const saved = async () => {
    await refreshSessionCache(auth, queryClient);
    toast.success(translate("auth.common.emailSaved"));
    onOpenChange(false);
  };

  const sendCode = useMutation({
    mutationFn: async (newEmail: string) => {
      const { data, error: apiError } = await auth.$fetch<{ verificationRequired?: boolean }>(
        "/email-otp/request-email-change",
        { method: "POST", body: { newEmail } },
      );
      if (apiError) throw apiError;
      return { newEmail, verificationRequired: data?.verificationRequired !== false };
    },
    onSuccess: async ({ newEmail, verificationRequired }) => {
      if (!verificationRequired) {
        await saved();
        return;
      }
      if (pendingEmail === newEmail) toast.success(translate("auth.email.codeResent"));
      setPendingEmail(newEmail);
      setCode("");
      setError(null);
    },
    onError: () => {
      setError("auth.email.sendError");
    },
  });

  const confirm = useMutation({
    mutationFn: async ({ newEmail, otp }: { newEmail: string; otp: string }) => {
      const { error: apiError } = await auth.$fetch("/email-otp/change-email", {
        method: "POST",
        body: { newEmail, otp },
      });
      if (apiError) throw apiError;
    },
    onSuccess: saved,
    onError: () => {
      setError("auth.email.codeError");
    },
  });

  const busy = sendCode.isPending || confirm.isPending;

  const handleEmailSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) {
      setError("auth.email.required");
      return;
    }
    setError(null);
    sendCode.mutate(trimmed);
  };

  const handleCodeSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!pendingEmail) return;
    const otp = code.replace(/\D/g, "");
    if (otp.length !== CODE_LENGTH) {
      setError("auth.email.codeRequired");
      return;
    }
    setError(null);
    confirm.mutate({ newEmail: pendingEmail, otp });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {pendingEmail ? (
          <form
            onSubmit={handleCodeSubmit}
            className="flex flex-col gap-6"
            data-testid="add-email.code-step"
          >
            <DialogHeader>
              <DialogTitle>{translate("auth.email.checkTitle")}</DialogTitle>
              <DialogDescription>
                {translate("auth.email.checkDescription", { email: pendingEmail })}
              </DialogDescription>
            </DialogHeader>
            <Field>
              <FieldLabel htmlFor="add-email-code">{translate("auth.email.code")}</FieldLabel>
              <Input
                id="add-email-code"
                inputMode="numeric"
                autoComplete="one-time-code"
                autoFocus
                required
                maxLength={CODE_LENGTH}
                value={code}
                onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
                data-testid="add-email.code-input"
              />
              {error ? <FieldError>{translate(error)}</FieldError> : null}
            </Field>
            <div className="flex flex-wrap gap-x-4 gap-y-2">
              <Button
                type="button"
                variant="link"
                size="xs"
                onClick={() => sendCode.mutate(pendingEmail)}
                disabled={busy}
                data-testid="add-email.resend"
              >
                {translate("auth.email.resend")}
              </Button>
              <Button
                type="button"
                variant="link"
                size="xs"
                onClick={() => {
                  setPendingEmail(null);
                  setCode("");
                  setError(null);
                }}
                disabled={busy}
                data-testid="add-email.change-address"
              >
                {translate("auth.email.changeAddress")}
              </Button>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => onOpenChange(false)}
                disabled={busy}
                data-testid="add-email.cancel"
              >
                {translate("auth.common.cancel")}
              </Button>
              <Button
                type="submit"
                disabled={busy || code.length !== CODE_LENGTH}
                data-testid="add-email.confirm"
              >
                {confirm.isPending
                  ? translate("auth.email.confirming")
                  : translate("auth.email.confirm")}
              </Button>
            </DialogFooter>
          </form>
        ) : (
          <form onSubmit={handleEmailSubmit} className="flex flex-col gap-6">
            <DialogHeader>
              <DialogTitle>{translate("auth.email.add")}</DialogTitle>
              <DialogDescription>{translate("auth.email.description")}</DialogDescription>
            </DialogHeader>
            <Field>
              <FieldLabel htmlFor="add-email-input">{translate("auth.common.email")}</FieldLabel>
              <Input
                id="add-email-input"
                type="email"
                inputMode="email"
                autoComplete="email"
                autoFocus
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder={translate("auth.common.emailExample")}
                data-testid="add-email.input"
              />
              {error ? (
                <FieldError>{translate(error)}</FieldError>
              ) : (
                <FieldDescription>{translate("auth.email.privacy")}</FieldDescription>
              )}
            </Field>
            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => onOpenChange(false)}
                disabled={busy}
                data-testid="add-email.cancel"
              >
                {translate("auth.common.cancel")}
              </Button>
              <Button type="submit" disabled={busy || !email.trim()} data-testid="add-email.save">
                {sendCode.isPending
                  ? translate("auth.common.saving")
                  : translate("auth.common.continue")}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

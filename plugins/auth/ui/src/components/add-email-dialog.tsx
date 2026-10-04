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

export function AddEmailDialog({ open, onOpenChange }: AddEmailDialogProps) {
  const translate = useLoginTranslation();
  const auth = useAuthClient();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<LoginMessageId | null>(null);

  useEffect(() => {
    if (open) {
      setEmail("");
      setError(null);
    }
  }, [open]);

  const mutation = useMutation({
    mutationFn: async (newEmail: string) => {
      const { error: apiError } = await auth.$fetch("/set-email", {
        method: "POST",
        body: { email: newEmail },
      });
      if (apiError) throw apiError;
    },
    onSuccess: async () => {
      await refreshSessionCache(auth, queryClient);
      toast.success(translate("auth.common.emailSaved"));
      onOpenChange(false);
    },
    onError: () => {
      setError("auth.email.saveError");
    },
  });

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) {
      setError("auth.email.required");
      return;
    }
    setError(null);
    mutation.mutate(trimmed);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-6">
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
              disabled={mutation.isPending}
              data-testid="add-email.cancel"
            >
              {translate("auth.common.cancel")}
            </Button>
            <Button
              type="submit"
              disabled={mutation.isPending || !email.trim()}
              data-testid="add-email.save"
            >
              {mutation.isPending ? translate("auth.common.saving") : translate("auth.common.save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

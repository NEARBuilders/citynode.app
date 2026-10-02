import { useMutation, useQueryClient } from "@tanstack/react-query";
import { refreshSessionCache } from "everything-dev/ui/auth";
import { type FormEvent, useEffect, useState } from "react";
import { toast } from "sonner";
import { useAuthClient } from "@/app";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { AppMessageId } from "@/i18n/catalogs";
import { useAppTranslation } from "@/i18n/runtime";

interface AddEmailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AddEmailDialog({ open, onOpenChange }: AddEmailDialogProps) {
  const translate = useAppTranslation();
  const auth = useAuthClient();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<AppMessageId | null>(null);

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
      toast.success(translate("common.emailSaved"));
      onOpenChange(false);
    },
    onError: () => {
      setError("email.saveError");
    },
  });

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) {
      setError("email.required");
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
            <DialogTitle>{translate("email.add")}</DialogTitle>
            <DialogDescription>{translate("email.description")}</DialogDescription>
          </DialogHeader>
          <Field>
            <FieldLabel htmlFor="add-email-input">{translate("common.email")}</FieldLabel>
            <Input
              id="add-email-input"
              type="email"
              inputMode="email"
              autoComplete="email"
              autoFocus
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder={translate("common.emailExample")}
              data-testid="add-email.input"
            />
            {error ? (
              <FieldError>{translate(error)}</FieldError>
            ) : (
              <FieldDescription>{translate("email.privacy")}</FieldDescription>
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
              {translate("common.cancel")}
            </Button>
            <Button
              type="submit"
              disabled={mutation.isPending || !email.trim()}
              data-testid="add-email.save"
            >
              {mutation.isPending ? translate("common.saving") : translate("common.save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

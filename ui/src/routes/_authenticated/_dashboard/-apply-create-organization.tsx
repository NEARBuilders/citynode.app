import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { useApiClient, useAuthClient } from "@/app";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { appErrorMessage } from "@/i18n/error-message";
import { useAppTranslation } from "@/i18n/runtime";
import { generateSlug, suggestAvailableSlug } from "@/lib/slug";

export function ApplyCreateOrganization() {
  const t = useAppTranslation();
  const auth = useAuthClient();
  const api = useApiClient();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const create = useMutation({
    mutationFn: async (value: string) => {
      const slug = await suggestAvailableSlug(generateSlug(value), async (candidate) => {
        const result = await api.auth.checkSlug({ slug: candidate });
        return !result.status;
      });
      const { data, error } = await auth.organization.create({ name: value, slug });
      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["organizations"] }),
    onError: (error: Error) => toast.error(appErrorMessage(error, t)),
  });
  const trimmed = name.trim();

  return (
    <form
      className="flex w-full flex-col items-start gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (trimmed) create.mutate(trimmed);
      }}
    >
      <Field>
        <FieldLabel htmlFor="apply-organization-name">
          {t("apply.organization.nameLabel")}
        </FieldLabel>
        <Input
          id="apply-organization-name"
          data-testid="apply.org-name"
          value={name}
          placeholder={t("apply.organization.namePlaceholder")}
          onChange={(event) => setName(event.target.value)}
        />
        <FieldDescription>{t("apply.organization.nameHint")}</FieldDescription>
      </Field>
      <Button
        type="submit"
        className="w-full sm:w-auto"
        disabled={!trimmed || create.isPending}
        data-testid="apply.create-org"
      >
        {create.isPending ? t("common.saving") : t("apply.organization.continue")}
      </Button>
    </form>
  );
}

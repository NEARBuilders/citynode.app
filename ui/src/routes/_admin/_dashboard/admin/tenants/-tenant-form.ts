import { useForm } from "@tanstack/react-form";
import { useEffect, useMemo, useRef } from "react";
import { useAppTranslation } from "@/i18n/runtime";
import { createTenantWizardSchema, type TenantWizardValues } from "./-tenant-wizard";

export const tenantWizardDefaultValues: TenantWizardValues = {
  kind: "country",
  parentId: "",
  name: "",
  slug: "",
  tenantName: "",
};

export function useTenantWizardForm(onSubmit: (values: TenantWizardValues) => Promise<unknown>) {
  const translate = useAppTranslation();
  const schema = useMemo(() => createTenantWizardSchema(translate), [translate]);
  const form = useForm({
    defaultValues: tenantWizardDefaultValues,
    validators: {
      onChange: schema,
      onSubmit: schema,
    },
    onSubmit: async ({ value }) => {
      await onSubmit(value);
    },
  });
  const previousTranslation = useRef(translate);
  useEffect(() => {
    if (previousTranslation.current === translate) return;
    previousTranslation.current = translate;
    void form.validate("change");
  }, [form, translate]);
  return form;
}

export type TenantWizardForm = ReturnType<typeof useTenantWizardForm>;

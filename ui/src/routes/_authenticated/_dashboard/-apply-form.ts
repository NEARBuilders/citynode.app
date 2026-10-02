import { useForm } from "@tanstack/react-form";
import { useEffect, useMemo, useRef } from "react";
import { useAppTranslation } from "@/i18n/runtime";
import type { NodeApplicationValues } from "./-node-application";
import { createNodeApplicationSchema } from "./-node-application";

const defaultValues: NodeApplicationValues = {
  kind: "country",
  parentId: null,
  name: "",
  slug: "",
  motivation: "",
};

export function useApplicationForm(onSubmit: (values: NodeApplicationValues) => Promise<unknown>) {
  const translate = useAppTranslation();
  const schema = useMemo(() => createNodeApplicationSchema(translate), [translate]);
  const form = useForm({
    defaultValues,
    validators: { onChange: schema, onSubmit: schema },
    onSubmit: async ({ value }) => onSubmit(value),
  });
  const previousTranslation = useRef(translate);
  useEffect(() => {
    if (previousTranslation.current === translate) return;
    previousTranslation.current = translate;
    void form.validate("change");
  }, [form, translate]);
  return form;
}

export type ApplicationForm = ReturnType<typeof useApplicationForm>;

import { CheckCircleIcon, CopyIcon, PlusIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { toast } from "sonner";
import { useAppTranslation } from "@/i18n/runtime";
import { Button } from "./ui/button";
import { Card, CardContent } from "./ui/card";
import { Field, FieldLabel } from "./ui/field";
import { Input } from "./ui/input";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "./ui/input-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";

export interface ApiKeyFormValues {
  name: string;
  expiresIn?: number;
}

interface ApiKeyFormProps {
  onCreate: (values: ApiKeyFormValues) => void;
  isPending: boolean;
}

const EXPIRATION_PRESETS = [
  { label: "keys.neverExpires", value: "0" },
  { label: "keys.sevenDays", value: String(7 * 24 * 60 * 60) },
  { label: "keys.thirtyDays", value: String(30 * 24 * 60 * 60) },
  { label: "keys.ninetyDays", value: String(90 * 24 * 60 * 60) },
  { label: "keys.oneYear", value: String(365 * 24 * 60 * 60) },
] as const;

export function ApiKeyForm({ onCreate, isPending }: ApiKeyFormProps) {
  const translate = useAppTranslation();
  const [name, setName] = useState("");
  const [expiresIn, setExpiresIn] = useState("0");
  const expirationPresets = EXPIRATION_PRESETS.map((preset) => ({
    ...preset,
    label: translate(preset.label),
  }));

  return (
    <form
      className="flex flex-col gap-2 sm:flex-row"
      onSubmit={(event) => {
        event.preventDefault();
        if (!name.trim()) return;
        const seconds = Number(expiresIn);
        onCreate({ name: name.trim(), expiresIn: seconds > 0 ? seconds : undefined });
        setName("");
        setExpiresIn("0");
      }}
    >
      <Field className="min-w-0 flex-1">
        <FieldLabel htmlFor="api-key-name" className="sr-only">
          {translate("keys.name")}
        </FieldLabel>
        <Input
          id="api-key-name"
          type="text"
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={64}
          placeholder={translate("keys.nameExample")}
          data-testid="api-key-name-input"
        />
      </Field>
      <div className="flex gap-2">
        <Select
          value={expiresIn}
          items={expirationPresets}
          onValueChange={(value) => setExpiresIn(value ?? "0")}
        >
          <SelectTrigger
            aria-label={translate("keys.expiration")}
            className="min-w-36 flex-1 sm:flex-none"
            data-testid="api-key-expiry-select"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {expirationPresets.map((preset) => (
              <SelectItem key={preset.value} value={preset.value}>
                {preset.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          type="submit"
          variant="outline"
          disabled={isPending || !name.trim()}
          data-testid="api-key-create-button"
        >
          <PlusIcon />
          {isPending ? translate("common.creating") : translate("keys.create")}
        </Button>
      </div>
    </form>
  );
}

export interface ApiKeyRevealProps {
  apiKey: {
    id: string;
    name: string | null;
    prefix: string | null;
    start: string | null;
    key: string;
    createdAt: string | Date;
  };
  onDismiss: () => void;
}

export function ApiKeyReveal({ apiKey, onDismiss }: ApiKeyRevealProps) {
  const translate = useAppTranslation();
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(apiKey.key);
      toast.success(translate("keys.copied"));
    } catch {
      toast.error(translate("keys.copyFailed"));
    }
  };

  return (
    <Card data-testid="api-key-reveal">
      <CardContent className="flex flex-col gap-4 p-5">
        <div className="flex items-start gap-3">
          <CheckCircleIcon className="mt-0.5 size-5 shrink-0 text-success" />
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="font-medium text-foreground">
              {translate("keys.createdNamed", { name: apiKey.name ?? translate("keys.new") })}
            </span>
            <span className="text-sm text-muted-foreground">{translate("keys.copyNotice")}</span>
          </div>
        </div>
        <InputGroup>
          <InputGroupInput
            readOnly
            value={apiKey.key}
            aria-label={translate("keys.newApi")}
            className="font-mono"
            onFocus={(event) => event.target.select()}
            onClick={(event) => event.currentTarget.select()}
          />
          <InputGroupAddon align="inline-end">
            <InputGroupButton onClick={handleCopy} aria-label={translate("keys.copy")}>
              <CopyIcon />
              {translate("common.copy")}
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
        <Button variant="ghost" size="sm" className="self-end" onClick={onDismiss}>
          {translate("common.done")}
        </Button>
      </CardContent>
    </Card>
  );
}

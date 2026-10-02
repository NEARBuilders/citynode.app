import { type FormEvent, useState } from "react";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useLoginTranslation } from "@/i18n/runtime";

export interface ApiKeyFormValues {
  name: string;
  expiresIn?: number;
}

const DAY = 24 * 60 * 60;

const EXPIRATION_ITEMS = [
  { label: "auth.keys.never", value: "0" },
  { label: "auth.keys.sevenDays", value: String(7 * DAY) },
  { label: "auth.keys.thirtyDays", value: String(30 * DAY) },
  { label: "auth.keys.ninetyDays", value: String(90 * DAY) },
  { label: "auth.keys.oneYear", value: String(365 * DAY) },
] as const;

export function ApiKeyCreateDialog({
  open,
  onOpenChange,
  onCreate,
  isPending,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (values: ApiKeyFormValues) => void;
  isPending: boolean;
}) {
  const translate = useLoginTranslation();
  const [name, setName] = useState("");
  const [expiresIn, setExpiresIn] = useState("0");
  const expirationItems = EXPIRATION_ITEMS.map((item) => ({
    ...item,
    label: translate(item.label),
  }));

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    const seconds = Number(expiresIn);
    onCreate({ name: trimmed, expiresIn: seconds > 0 ? seconds : undefined });
    setName("");
    setExpiresIn("0");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-6">
          <DialogHeader>
            <DialogTitle>{translate("auth.keys.createTitle")}</DialogTitle>
            <DialogDescription>{translate("auth.keys.once")}</DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="api-key-name">{translate("auth.common.name")}</FieldLabel>
              <Input
                id="api-key-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={64}
                placeholder={translate("auth.keys.example")}
                data-testid="api-keys.name-input"
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="api-key-expiry">{translate("auth.keys.expires")}</FieldLabel>
              <Select
                value={expiresIn}
                items={expirationItems}
                onValueChange={(value) => setExpiresIn(value ?? "0")}
              >
                <SelectTrigger
                  id="api-key-expiry"
                  className="w-full"
                  data-testid="api-keys.expiry-select"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {expirationItems.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {translate("auth.common.cancel")}
            </Button>
            <Button
              type="submit"
              disabled={isPending || !name.trim()}
              data-testid="api-keys.create-submit"
            >
              {isPending ? translate("auth.common.creating") : translate("auth.keys.create")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

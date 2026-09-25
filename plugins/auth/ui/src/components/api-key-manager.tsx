import { CopyIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "./ui/button";
import { Card, CardContent } from "./ui/card";
import { InfoRow } from "./ui/info-row";
import { Input } from "./ui/input";
import { Label } from "./ui/label";

export interface ApiKeyFormValues {
  name: string;
  expiresIn?: number;
}

interface ApiKeyFormProps {
  onCreate: (values: ApiKeyFormValues) => void;
  isPending: boolean;
}

const EXPIRATION_PRESETS = [
  { label: "no expiry", value: 0 },
  { label: "7 days", value: 7 * 24 * 60 * 60 },
  { label: "30 days", value: 30 * 24 * 60 * 60 },
  { label: "90 days", value: 90 * 24 * 60 * 60 },
  { label: "1 year", value: 365 * 24 * 60 * 60 },
] as const;

export function ApiKeyForm({ onCreate, isPending }: ApiKeyFormProps) {
  const [name, setName] = useState("");
  const [expiresInSeconds, setExpiresInSeconds] = useState<number>(0);

  const handleSubmit = () => {
    if (!name.trim()) return;
    onCreate({
      name: name.trim(),
      expiresIn: expiresInSeconds > 0 ? expiresInSeconds : undefined,
    });
    setName("");
    setExpiresInSeconds(0);
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Name</Label>
        <Input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={64}
          placeholder="API key name"
        />
      </div>

      <div className="space-y-2">
        <Label>Expiration</Label>
        <div className="flex flex-wrap gap-2">
          {EXPIRATION_PRESETS.map((preset) => (
            <Button
              key={preset.value}
              type="button"
              variant={expiresInSeconds === preset.value ? "default" : "outline"}
              size="sm"
              onClick={() => setExpiresInSeconds(preset.value)}
            >
              {preset.label}
            </Button>
          ))}
        </div>
      </div>

      <p className="text-xs text-muted-foreground leading-relaxed">
        Permissions, rate limits, and refill configuration are server-only and cannot be set from
        the browser. Provision them through a server-side endpoint or admin tooling.
      </p>

      <div className="flex gap-2">
        <Button
          onClick={handleSubmit}
          disabled={isPending || !name.trim()}
          variant="outline"
          size="sm"
        >
          {isPending ? "creating..." : "create key"}
        </Button>
      </div>
    </div>
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
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(apiKey.key);
      toast.success("API key copied");
    } catch {
      toast.error("Failed to copy API key");
    }
  };

  return (
    <Card>
      <CardContent className="p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="font-medium">New API key ready</div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Copy and store this key now. You will only be able to see the full secret once.
            </p>
          </div>
          <Button onClick={onDismiss} variant="outline" size="sm">
            dismiss
          </Button>
        </div>
        <div className="flex flex-col gap-3 md:flex-row">
          <Input
            readOnly
            value={apiKey.key}
            className="flex-1"
            onFocus={(e) => e.target.select()}
            onClick={(e) => e.currentTarget.select()}
          />
          <Button onClick={handleCopy} variant="outline" size="sm">
            <CopyIcon data-icon="inline-start" />
            copy
          </Button>
        </div>
        <div className="flex flex-col">
          <InfoRow label="name" value={apiKey.name ?? "unnamed"} />
          <InfoRow label="prefix" value={`${apiKey.prefix ?? "api_"}...`} mono />
          <InfoRow label="created" value={new Date(apiKey.createdAt).toLocaleString()} />
        </div>
      </CardContent>
    </Card>
  );
}

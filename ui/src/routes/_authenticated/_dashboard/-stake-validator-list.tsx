import { GlobeIcon } from "@phosphor-icons/react";
import type { useApiClient } from "@/app";
import { Badge } from "@/components";
import { Field, FieldContent, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { cn } from "@/lib/utils";

type ApiClient = ReturnType<typeof useApiClient>;
export type StakeValidator = Awaited<
  ReturnType<ApiClient["resolveStakingValidators"]>
>["validators"][number];

export function StakeValidatorList({
  onSelect,
  selectedValidatorId,
  validators,
}: {
  onSelect: (validatorId: string) => void;
  selectedValidatorId: string | null;
  validators: StakeValidator[];
}) {
  return (
    <FieldSet>
      <FieldLegend variant="label">Validators</FieldLegend>
      <RadioGroup
        value={selectedValidatorId}
        onValueChange={(value) => {
          if (typeof value === "string") onSelect(value);
        }}
      >
        {validators.map((validator) => {
          const isCommunity = validator.role === "community";
          return (
            <FieldLabel key={validator.id} htmlFor={`validator-${validator.id}`}>
              <Field orientation="horizontal">
                <div
                  className={cn(
                    "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
                    isCommunity
                      ? "bg-muted text-muted-foreground"
                      : "bg-foreground text-background",
                  )}
                >
                  <GlobeIcon className="h-4 w-4" />
                </div>
                <FieldContent className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-foreground truncate">
                      {validator.accountId}
                    </span>
                    {validator.isDefault && <Badge variant="default">default</Badge>}
                  </div>
                  <div className="mt-1 flex items-center gap-2">
                    <Badge variant={isCommunity ? "outline" : "secondary"}>
                      <span className="capitalize">{validator.role}</span>
                    </Badge>
                    {validator.protocol && validator.protocol !== "near" && (
                      <Badge variant="outline" className="font-mono">
                        {validator.protocol}
                      </Badge>
                    )}
                  </div>
                </FieldContent>
                <RadioGroupItem id={`validator-${validator.id}`} value={validator.id} />
              </Field>
            </FieldLabel>
          );
        })}
      </RadioGroup>
    </FieldSet>
  );
}

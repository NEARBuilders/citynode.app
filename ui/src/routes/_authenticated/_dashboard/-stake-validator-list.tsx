import { GlobeIcon } from "@phosphor-icons/react";
import type { useApiClient } from "@/app";
import { Badge } from "@/components";
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
    <div className="space-y-2">
      <p className="text-sm font-medium text-muted-foreground">Validators</p>
      {validators.map((validator) => {
        const isSelected = selectedValidatorId === validator.id;
        const isCommunity = validator.role === "community";
        return (
          <button
            key={validator.id}
            type="button"
            onClick={() => onSelect(validator.id)}
            className={cn(
              "flex w-full items-center gap-3 rounded-xl border p-4 text-left transition-colors",
              isSelected ? "border-foreground bg-card" : "border-border bg-card hover:bg-muted",
              isCommunity && !isSelected && "opacity-80",
            )}
          >
            <div
              className={cn(
                "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
                isCommunity ? "bg-muted text-muted-foreground" : "bg-foreground text-background",
              )}
            >
              <GlobeIcon className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
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
                  <Badge variant="outline">
                    <span className="font-mono">{validator.protocol}</span>
                  </Badge>
                )}
              </div>
            </div>
            <div
              className={cn(
                "flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2",
                isSelected ? "border-foreground bg-foreground" : "border-border bg-transparent",
              )}
            >
              {isSelected && <div className="h-1.5 w-1.5 rounded-full bg-background" />}
            </div>
          </button>
        );
      })}
    </div>
  );
}

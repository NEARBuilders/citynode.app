import { ArrowSquareOutIcon, HammerIcon } from "@phosphor-icons/react";
import { cn } from "cn";
import type { ClientRuntimeConfig } from "everything-dev/types";
import { getRepository } from "@/app";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useAppTranslation } from "@/i18n/runtime";

interface UnderConstructionProps {
  label?: string;
  sourceFile?: string;
  url?: string;
  tooltip?: string;
  className?: string;
  onClick?: () => void;
  skipNavigation?: boolean;
  pressed?: boolean;
  runtimeConfig?: Partial<ClientRuntimeConfig>;
}

export function UnderConstruction({
  label,
  sourceFile,
  url,
  tooltip,
  className,
  onClick,
  skipNavigation,
  pressed,
  runtimeConfig,
}: UnderConstructionProps) {
  const translate = useAppTranslation();
  const resolveOutlink = () => {
    if (url) return url;
    const repository = getRepository(runtimeConfig);
    if (!repository) return undefined;
    return sourceFile ? `${repository}/blob/main/${sourceFile}` : repository;
  };
  const hasOutlink = Boolean(resolveOutlink());

  const handleClick = () => {
    onClick?.();
    const outlink = resolveOutlink();
    if (skipNavigation || !outlink) return;
    setTimeout(() => {
      window.open(outlink, "_blank", "noopener,noreferrer");
    }, 150);
  };

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger
          className={cn("block cursor-pointer", className)}
          onClick={handleClick}
          data-pressed={pressed || undefined}
          aria-label={
            skipNavigation || !hasOutlink
              ? label
                ? translate("feature.namedConstruction", { name: label ?? "" })
                : translate("feature.underConstruction")
              : label
                ? translate("feature.namedSource", { name: label ?? "" })
                : translate("feature.source")
          }
        >
          <span className="flex flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-border bg-muted px-3 py-4 text-center text-xs font-medium text-muted-foreground transition-colors hover:text-foreground">
            <HammerIcon className="size-5" aria-hidden="true" />
            <span>{translate("feature.inProgress")}</span>
          </span>
        </TooltipTrigger>
        {!skipNavigation && hasOutlink && (
          <TooltipContent side="top" sideOffset={6}>
            <span className="flex items-center gap-1.5">
              {tooltip ?? translate("feature.contribute")}
              <ArrowSquareOutIcon className="size-3" />
            </span>
          </TooltipContent>
        )}
      </Tooltip>
    </TooltipProvider>
  );
}

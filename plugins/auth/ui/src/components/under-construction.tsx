import { ArrowSquareOutIcon } from "@phosphor-icons/react";
import type { ClientRuntimeConfig } from "everything-dev/types";
import { getRuntimeConfig } from "everything-dev/ui/runtime";
import { domAnimation, LazyMotion, m } from "framer-motion";
import underConstructionImage from "@/assets/under-construction.gif";

type RuntimeConfigInput = Partial<import("everything-dev/types").ClientRuntimeConfig> | undefined;

function resolveRuntimeConfig(config?: RuntimeConfigInput) {
  if (config) return config;
  if (typeof window === "undefined") return undefined;
  try {
    return getRuntimeConfig();
  } catch {
    return undefined;
  }
}

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

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
  const resolveOutlink = () => {
    if (url) return url;
    const repository = resolveRuntimeConfig(runtimeConfig)?.repository;
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
        <TooltipTrigger render={<div className={className} style={{ perspective: 800 }} />}>
          <button
            type="button"
            className="bg-transparent border-0 transition-transform p-4 -m-4"
            style={{ cursor: "pointer" }}
            onClick={handleClick}
            aria-label={
              skipNavigation || !hasOutlink
                ? label
                  ? `${label} under construction`
                  : "under construction"
                : label
                  ? `${label} under construction - view source`
                  : "under construction - view source"
            }
          >
            <LazyMotion features={domAnimation}>
              <m.div
                animate={
                  pressed
                    ? { scale: 0.95, rotateY: 0, z: -15 }
                    : {
                        rotateY: [0, 12, 0, -12, 0],
                        y: [0, -4, 0],
                      }
                }
                transition={
                  pressed
                    ? { duration: 0.15 }
                    : {
                        rotateY: {
                          duration: 4,
                          ease: "easeInOut",
                          repeat: Infinity,
                        },
                        y: {
                          duration: 3,
                          ease: "easeInOut",
                          repeat: Infinity,
                        },
                      }
                }
                whileTap={{ scale: 0.95, rotateY: 0, z: -15 }}
                className="relative"
                style={{ transformStyle: "preserve-3d" }}
              >
                <img
                  src={underConstructionImage}
                  alt={label ? `${label} under construction` : "under construction"}
                  className="w-full h-auto rounded-xl border border-border object-cover shadow-lg"
                />
              </m.div>
            </LazyMotion>
          </button>
        </TooltipTrigger>
        {!skipNavigation && hasOutlink && (
          <TooltipContent side="top">
            <span className="flex items-center gap-1.5">
              {tooltip ?? "see code and contribute"}
              <ArrowSquareOutIcon className="w-3 h-3" />
            </span>
          </TooltipContent>
        )}
      </Tooltip>
    </TooltipProvider>
  );
}

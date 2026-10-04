import { SpinnerIcon } from "@phosphor-icons/react";
import { cn } from "cn";
import { useLoginTranslation } from "@/i18n/runtime";

function Spinner({ className, ...props }: React.ComponentProps<"svg">) {
  const translate = useLoginTranslation();
  return (
    <SpinnerIcon
      data-slot="spinner"
      role="status"
      aria-label={translate("auth.common.loading")}
      className={cn("size-4 animate-spin", className)}
      {...props}
    />
  );
}

export { Spinner };

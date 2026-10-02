import { SpinnerIcon } from "@phosphor-icons/react";
import { cn } from "cn";
import { useAppTranslation } from "@/i18n/runtime";

function Spinner({ className, ...props }: React.ComponentProps<"svg">) {
  const translate = useAppTranslation();
  return (
    <SpinnerIcon
      data-slot="spinner"
      role="status"
      aria-label={translate("common.loading")}
      className={cn("size-4 animate-spin", className)}
      {...props}
    />
  );
}

export { Spinner };

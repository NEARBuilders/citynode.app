import { WalletIcon } from "@phosphor-icons/react";
import { PingpayOnramp, PingpayOnrampError } from "@pingpay/onramp-sdk";
import { useMutation } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { toast } from "sonner";
import pingpayLogoDark from "@/assets/brands/pingpay/pingpay-logo-dark.png";
import pingpayLogoLight from "@/assets/brands/pingpay/pingpay-logo-light.png";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useNearAccount } from "@/lib/use-near-account";
import { cn } from "@/lib/utils";

export function StakeOnramp() {
  const nearAccountId = useNearAccount();
  const onrampRef = useRef<PingpayOnramp | null>(null);
  const onrampMutation = useMutation({
    mutationFn: async () => {
      const onramp = new PingpayOnramp({
        destinationAddress: nearAccountId ?? undefined,
        onPopupClose: () => onrampMutation.reset(),
      });
      onrampRef.current = onramp;
      return onramp.initiateOnramp({ chain: "NEAR", asset: "NEAR" });
    },
    onSuccess: (result) => {
      toast.success("Purchase complete", { description: `Deposited to ${result.depositAddress}` });
    },
    onError: (err: Error) => {
      if (err instanceof PingpayOnrampError) toast.error(err.message || "Onramp failed");
      else toast.error("Unexpected error during purchase");
    },
  });
  useEffect(() => () => onrampRef.current?.close(), []);
  const disabled = !nearAccountId;
  const pending = onrampMutation.isPending;
  const onBuy = () => onrampMutation.mutate();

  const button = (
    <button
      type="button"
      onClick={onBuy}
      disabled={disabled || pending}
      aria-label={pending ? "Opening PingPay" : "Buy NEAR with PingPay"}
      className={cn(
        "group inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl border-2 px-5 text-sm font-semibold transition-colors",
        "border-[#AF9EF9] bg-white/80 text-[#3D315E] hover:bg-white",
        "dark:border-[#6D5BD0] dark:bg-[#2B2444] dark:text-[#F3EEFF] dark:hover:bg-[#332B54]",
        "shadow-sm hover:shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#AF9EF9]/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        disabled || pending ? "cursor-not-allowed opacity-50 hover:shadow-sm" : "cursor-pointer",
      )}
    >
      {pending ? (
        <>
          <span className="size-4 animate-spin rounded-full border-2 border-[#AF9EF9] border-t-[#3D315E] dark:border-t-[#F3EEFF]" />
          Opening…
        </>
      ) : (
        <>
          <span>Buy with</span>
          <span className="relative inline-block h-4 w-[52px]">
            <img
              src={pingpayLogoDark}
              alt="PingPay"
              className="absolute inset-0 h-full w-full object-contain dark:hidden"
            />
            <img
              src={pingpayLogoLight}
              alt="PingPay"
              className="absolute inset-0 hidden h-full w-full object-contain dark:block"
            />
          </span>
        </>
      )}
    </button>
  );

  return (
    <div className="relative overflow-hidden rounded-2xl border-2 border-[#AF9EF9]/50 bg-gradient-to-br from-[#F9F7FF] to-[#EFE9FF] p-5 dark:border-[#6D5BD0]/40 dark:from-[#211C33] dark:to-[#2B2444]">
      <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/70 dark:bg-white/5">
            <WalletIcon className="h-4 w-4 text-[#6D5BD0] dark:text-[#C9BBFF]" />
          </div>
          <div>
            <p className="text-sm font-semibold text-[#3D315E] dark:text-[#EDE8FF]">
              Need NEAR to stake?
            </p>
            <p className="text-xs text-[#6B5F94] dark:text-[#B9AEDE]">
              Buy instantly with card, Apple Pay, or bank transfer.
            </p>
          </div>
        </div>
        {disabled ? (
          <Tooltip>
            <TooltipTrigger render={button} />
            <TooltipContent side="top" className="max-w-xs">
              Connect a NEAR wallet to buy NEAR
            </TooltipContent>
          </Tooltip>
        ) : (
          button
        )}
      </div>
    </div>
  );
}

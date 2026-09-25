import { SpinnerIcon, WalletIcon } from "@phosphor-icons/react";
import { PingpayOnramp, PingpayOnrampError } from "@pingpay/onramp-sdk";
import { useMutation } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { toast } from "sonner";
import pingpayLogoDark from "@/assets/brands/pingpay/pingpay-logo-dark.png";
import pingpayLogoLight from "@/assets/brands/pingpay/pingpay-logo-light.png";
import { Button } from "@/components";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useNearAccount } from "@/lib/use-near-account";

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
    <Button
      type="button"
      variant="outline"
      onClick={onBuy}
      disabled={disabled || pending}
      aria-label={pending ? "Opening PingPay" : "Buy NEAR with PingPay"}
      className="shrink-0"
    >
      {pending ? (
        <>
          <SpinnerIcon className="size-4 animate-spin" />
          Opening…
        </>
      ) : (
        <>
          <span>Buy with</span>
          <span className="relative inline-block h-4 w-13">
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
    </Button>
  );

  return (
    <div className="rounded-2xl bg-muted p-5">
      <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-background">
            <WalletIcon className="h-4 w-4 text-muted-foreground" />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">Need NEAR to stake?</p>
            <p className="text-sm text-muted-foreground">
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

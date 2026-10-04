import { WalletIcon } from "@phosphor-icons/react";
import { PingpayOnramp, PingpayOnrampError } from "@pingpay/onramp-sdk";
import { useMutation } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { toast } from "sonner";
import pingpayLogoDark from "@/assets/brands/pingpay/pingpay-logo-dark.png";
import pingpayLogoLight from "@/assets/brands/pingpay/pingpay-logo-light.png";
import { Button } from "@/components/ui/button";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item";
import { Spinner } from "@/components/ui/spinner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { appErrorMessage } from "@/i18n/error-message";
import { useAppTranslation } from "@/i18n/runtime";
import { useNearAccount } from "@/lib/use-near-account";

export function StakeOnramp() {
  const translate = useAppTranslation();
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
      toast.success(translate("purchase.complete"), {
        description: translate("stake.depositAddress", { address: result.depositAddress ?? "" }),
      });
    },
    onError: (err: Error) => {
      if (err instanceof PingpayOnrampError) toast.error(appErrorMessage(err, translate));
      else toast.error(translate("purchase.failed"));
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
      size="sm"
      onClick={onBuy}
      disabled={disabled || pending}
      aria-label={pending ? translate("purchase.opening") : translate("purchase.buyNear")}
    >
      {pending ? (
        <>
          <Spinner />
          {translate("common.opening")}
        </>
      ) : (
        <>
          <span>{translate("stake.buyWith")}</span>
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
    <Item variant="muted" data-testid="stake.onramp">
      <ItemMedia variant="icon">
        <WalletIcon />
      </ItemMedia>
      <ItemContent>
        <ItemTitle>{translate("purchase.needNear")}</ItemTitle>
        <ItemDescription>{translate("purchase.description")}</ItemDescription>
      </ItemContent>
      <ItemActions>
        {disabled ? (
          <Tooltip>
            <TooltipTrigger render={button} />
            <TooltipContent side="top" className="max-w-xs">
              {translate("wallet.connectFirst")}
            </TooltipContent>
          </Tooltip>
        ) : (
          button
        )}
      </ItemActions>
    </Item>
  );
}

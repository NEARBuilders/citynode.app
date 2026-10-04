import type { AuthClient } from "everything-dev/ui/auth";
import { toast } from "sonner";
import { authErrorMessage } from "@/i18n/error-message";
import { translateLoginMessage } from "@/i18n/runtime";

const PASSKEY_OFFER_DISMISSED_KEY = "device-link.passkey-offer-dismissed";

function isPasskeyOfferDismissed() {
  try {
    return window.localStorage.getItem(PASSKEY_OFFER_DISMISSED_KEY) === "true";
  } catch {
    return false;
  }
}

function rememberPasskeyOfferDismissed() {
  try {
    window.localStorage.setItem(PASSKEY_OFFER_DISMISSED_KEY, "true");
  } catch {}
}

async function addPasskeyOnThisDevice(auth: AuthClient) {
  const { error } = await auth.passkey.addPasskey();
  if (error) {
    toast.error(authErrorMessage(error, translateLoginMessage));
    return;
  }
  rememberPasskeyOfferDismissed();
  toast.success(translateLoginMessage("auth.passkey.added"));
}

export function offerPasskeyOnThisDevice(auth: AuthClient) {
  if (isPasskeyOfferDismissed()) return;
  toast(translateLoginMessage("auth.passkey.offer"), {
    id: "device-link.passkey-offer",
    testId: "device-link.passkey-offer",
    description: translateLoginMessage("auth.passkey.nextTime"),
    duration: Number.POSITIVE_INFINITY,
    action: {
      label: translateLoginMessage("auth.passkey.add"),
      onClick: () => void addPasskeyOnThisDevice(auth),
    },
    cancel: {
      label: translateLoginMessage("auth.common.notNow"),
      onClick: rememberPasskeyOfferDismissed,
    },
    onDismiss: rememberPasskeyOfferDismissed,
  });
}

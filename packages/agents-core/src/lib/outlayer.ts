import type { OutlayerWalletClient } from "@near-intents-agent-api/outlayer";
import { requiredSlot } from "./slot.js";

const slot = requiredSlot<OutlayerWalletClient>("OutLayer provider");

export function configureOutlayer(client: OutlayerWalletClient | undefined) {
  slot.set(client);
}

export function getOutlayer(): OutlayerWalletClient {
  return slot.get();
}

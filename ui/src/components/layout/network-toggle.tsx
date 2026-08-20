import { Globe } from "lucide-react";
import { useAuthClient } from "@/app";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

export function NetworkToggle() {
  const auth = useAuthClient();
  const supportedNetworks = auth.near.getSupportedNetworks();
  const currentNetwork = auth.useActiveNetwork();

  if (supportedNetworks.length <= 1) return null;

  return (
    <ToggleGroup
      type="single"
      value={currentNetwork}
      onValueChange={(value) => {
        if (value) auth.near.setNetwork(value as (typeof supportedNetworks)[number]);
      }}
    >
      {supportedNetworks.map((network) => (
        <ToggleGroupItem key={network} value={network} aria-label={`Switch to ${network}`}>
          <Globe />
          {network === "mainnet" ? "Mainnet" : "Testnet"}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

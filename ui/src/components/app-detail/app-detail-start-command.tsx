import { CopyIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function AppDetailStartCommand({ command }: { command: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(command);
    setCopied(true);
    toast.success("Copied");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Button variant="outline" size="lg" onClick={handleCopy} className="w-full justify-between">
      <code className="min-w-0 truncate font-mono text-sm">{command}</code>
      <span className={copied ? "text-brand-strong" : "text-muted-foreground"}>
        <CopyIcon size={14} />
      </span>
    </Button>
  );
}

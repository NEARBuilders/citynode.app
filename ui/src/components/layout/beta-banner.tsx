import { X } from "lucide-react";
import { useEffect, useState } from "react";

export function BetaBanner() {
  const [dismissed, setDismissed] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("beta-banner-dismissed") === "true";
  });

  useEffect(() => {
    localStorage.setItem("beta-banner-dismissed", String(dismissed));
  }, [dismissed]);

  if (dismissed) return null;

  return (
    <div className="shrink-0 flex items-center justify-center py-1.5 pl-3 pr-1 bg-yellow-300 border-b border-yellow-400">
      <span className="flex-1 text-[11px] font-bold tracking-wide text-yellow-950 text-center">
        Beta database will be wiped periodically. Do not save data you want to keep.
      </span>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        className="shrink-0 p-1 text-yellow-950/60 hover:text-yellow-950 transition-colors cursor-pointer"
        aria-label="Dismiss beta banner"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

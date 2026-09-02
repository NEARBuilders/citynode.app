import { Building2 } from "lucide-react";

interface LogoProps {
  appName: string;
  showText?: boolean;
  className?: string;
  size?: "sm" | "md" | "lg";
}

export function Logo({ appName, showText = false, className = "", size = "md" }: LogoProps) {
  const boxSize = size === "sm" ? "w-8 h-8" : size === "lg" ? "w-14 h-14" : "w-10 h-10";
  const iconSize = size === "sm" ? "w-4 h-4" : size === "lg" ? "w-7 h-7" : "w-5 h-5";

  return (
    <div className={`flex items-center justify-center gap-3 ${className}`}>
      <div
        className={`${boxSize} flex items-center justify-center border-2 border-outset border-border-strong bg-card shadow-sm`}
      >
        <Building2 className={`${iconSize} text-foreground`} aria-hidden />
      </div>
      {showText && <span className="text-sm font-semibold text-foreground">{appName}</span>}
    </div>
  );
}

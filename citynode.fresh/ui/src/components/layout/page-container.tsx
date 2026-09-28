import type { ReactNode } from "react";

const variants = {
  narrow: "max-w-2xl",
  default: "max-w-4xl",
  wide: "max-w-6xl",
} as const;

type PageContainerVariant = keyof typeof variants;

interface PageContainerProps {
  variant?: PageContainerVariant;
  children: ReactNode;
  className?: string;
}

export function PageContainer({
  variant = "default",
  children,
  className = "",
}: PageContainerProps) {
  return (
    <div className={`mx-auto w-full ${variants[variant]} px-4 sm:px-6 py-6 sm:py-10 ${className}`}>
      {children}
    </div>
  );
}

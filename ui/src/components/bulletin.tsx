import { MegaphoneIcon } from "@phosphor-icons/react";
import { cn } from "cn";
import { Markdown } from "@/components/markdown";
import { useAppTranslation } from "@/i18n/runtime";

interface BulletinProps {
  content: string;
  className?: string;
}

export function Bulletin({ content, className }: BulletinProps) {
  const translate = useAppTranslation();
  const trimmed = content.trim();
  if (!trimmed) return null;

  return (
    <section
      aria-label={translate("bulletin.title")}
      data-testid="bulletin"
      className={cn(
        "flex flex-col gap-3 rounded-2xl bg-info-muted px-5 py-4 text-info-muted-foreground",
        className,
      )}
    >
      <div className="flex items-center gap-2 text-sm font-medium">
        <MegaphoneIcon className="size-4 shrink-0" aria-hidden="true" />
        {translate("bulletin.title")}
      </div>
      <Markdown
        content={trimmed}
        variant="compact"
        className="[&_blockquote]:text-info-muted-foreground [&_del]:text-info-muted-foreground [&_h1]:text-info-muted-foreground [&_h2]:text-info-muted-foreground [&_h3]:text-info-muted-foreground [&_h4]:text-info-muted-foreground [&_li]:text-info-muted-foreground [&_p]:text-info-muted-foreground [&_strong]:text-info-muted-foreground"
      />
    </section>
  );
}

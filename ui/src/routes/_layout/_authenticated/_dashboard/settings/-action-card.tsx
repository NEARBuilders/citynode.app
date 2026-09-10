import { Button, Card } from "@/components";

export function ActionCard({
  title,
  body,
  actionLabel,
  onClick,
  disabled,
}: {
  title: string;
  body: string;
  actionLabel: string;
  onClick: () => void;
  disabled: boolean;
}) {
  return (
    <Card className="p-6 space-y-3">
      <div className="space-y-1">
        <div className="font-medium text-foreground">{title}</div>
        <p className="text-sm text-muted-foreground leading-relaxed">{body}</p>
      </div>
      <Button onClick={onClick} disabled={disabled} variant="outline">
        {actionLabel}
      </Button>
    </Card>
  );
}

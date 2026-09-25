import { Button, Card, Input } from "@/components";

export function OrganizationEditForm({
  editName,
  editSlug,
  isPending,
  onCancel,
  onNameChange,
  onSave,
  onSlugChange,
}: {
  editName: string;
  editSlug: string;
  isPending: boolean;
  onCancel: () => void;
  onNameChange: (value: string) => void;
  onSave: () => void;
  onSlugChange: (value: string) => void;
}) {
  return (
    <Card className="flex flex-col gap-4 p-6">
      <div className="text-sm font-medium text-muted-foreground">Edit organization</div>
      <div className="grid gap-4 md:grid-cols-2">
        <Input
          type="text"
          value={editName}
          onChange={(event) => onNameChange(event.target.value)}
          placeholder="Organization name"
        />
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground text-sm">@</span>
          <Input
            type="text"
            value={editSlug}
            onChange={(event) => onSlugChange(event.target.value.replace(/[^a-z0-9-]/g, ""))}
            placeholder="slug"
            pattern="[a-z0-9-]+"
          />
        </div>
      </div>
      <div className="flex gap-2">
        <Button onClick={onSave} disabled={isPending || !editName || !editSlug}>
          {isPending ? "saving..." : "save"}
        </Button>
        <Button onClick={onCancel} variant="outline">
          cancel
        </Button>
      </div>
    </Card>
  );
}

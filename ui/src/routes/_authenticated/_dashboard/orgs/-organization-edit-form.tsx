import { Button, Card, Field, FieldLabel, Input } from "@/components";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from "@/components/ui/input-group";

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
        <Field>
          <FieldLabel htmlFor="organization-edit-name">Name</FieldLabel>
          <Input
            id="organization-edit-name"
            type="text"
            value={editName}
            onChange={(event) => onNameChange(event.target.value)}
            placeholder="Organization name"
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="organization-edit-slug">Slug</FieldLabel>
          <InputGroup>
            <InputGroupAddon>
              <InputGroupText>@</InputGroupText>
            </InputGroupAddon>
            <InputGroupInput
              id="organization-edit-slug"
              type="text"
              value={editSlug}
              onChange={(event) => onSlugChange(event.target.value.replace(/[^a-z0-9-]/g, ""))}
              placeholder="slug"
              pattern="[a-z0-9-]+"
              className="font-mono"
            />
          </InputGroup>
        </Field>
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

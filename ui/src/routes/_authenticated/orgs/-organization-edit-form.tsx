import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  FieldDescription,
  FieldLabel,
  Input,
} from "@/components";
import { FieldGroup } from "@/components/ui/field";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from "@/components/ui/input-group";
import { useAppTranslation } from "@/i18n/runtime";
import { HandleStatusAddon, useHandleStatus } from "./-handle-status";

export function OrganizationEditForm({
  open,
  currentSlug,
  editName,
  editSlug,
  isPending,
  onCancel,
  onNameChange,
  onSave,
  onSlugChange,
}: {
  open: boolean;
  currentSlug: string;
  editName: string;
  editSlug: string;
  isPending: boolean;
  onCancel: () => void;
  onNameChange: (value: string) => void;
  onSave: () => void;
  onSlugChange: (value: string) => void;
}) {
  const translate = useAppTranslation();
  const handleStatus = useHandleStatus(editSlug, currentSlug);
  const canSave =
    !isPending &&
    !!editName &&
    !!editSlug &&
    handleStatus !== "taken" &&
    handleStatus !== "checking";
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onCancel()}>
      <DialogContent>
        <form
          className="flex flex-col gap-6"
          onSubmit={(event) => {
            event.preventDefault();
            if (canSave) onSave();
          }}
        >
          <DialogHeader>
            <DialogTitle>{translate("org.edit")}</DialogTitle>
            <DialogDescription>{translate("org.handleChangesHint")}</DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="organization-edit-name">{translate("common.name")}</FieldLabel>
              <Input
                id="organization-edit-name"
                type="text"
                value={editName}
                onChange={(event) => onNameChange(event.target.value)}
                placeholder={translate("org.name")}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="organization-edit-slug">{translate("org.handle")}</FieldLabel>
              <InputGroup>
                <InputGroupAddon>
                  <InputGroupText>@</InputGroupText>
                </InputGroupAddon>
                <InputGroupInput
                  id="organization-edit-slug"
                  type="text"
                  value={editSlug}
                  onChange={(event) => onSlugChange(event.target.value.replace(/[^a-z0-9-]/g, ""))}
                  placeholder={translate("org.handleExample")}
                  pattern="[a-z0-9-]+"
                  className="font-mono"
                  aria-invalid={handleStatus === "taken" || undefined}
                />
                <HandleStatusAddon status={handleStatus} />
              </InputGroup>
              {handleStatus === "taken" ? (
                <FieldDescription>{translate("org.handleTakenChooseAnother")}</FieldDescription>
              ) : null}
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onCancel}>
              {translate("common.cancel")}
            </Button>
            <Button type="submit" disabled={!canSave}>
              {isPending ? translate("common.saving") : translate("common.save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

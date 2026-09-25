import { useQueryClient } from "@tanstack/react-query";
import { refreshSessionCache, useAuthClient } from "everything-dev/ui/auth";
import { type FormEvent, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

export function DisplayNameStep({ initialName }: { initialName: string }) {
  const auth = useAuthClient();
  const queryClient = useQueryClient();
  const [name, setName] = useState(initialName);
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);

  if (done) return null;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    setPending(true);
    const { error } = await auth.updateUser({ name: trimmed });
    setPending(false);
    if (error) {
      toast.error(error.message || "Could not save your name");
      return;
    }
    await refreshSessionCache(auth, queryClient);
    setDone(true);
  };

  return (
    <form
      onSubmit={(event) => void handleSubmit(event)}
      className="space-y-3 text-left"
      data-testid="onboard.display-name"
    >
      <Field>
        <FieldLabel htmlFor="onboard-display-name">What should organizers call you?</FieldLabel>
        <Input
          id="onboard-display-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Your name"
          autoComplete="name"
          maxLength={64}
          data-testid="onboard.display-name-input"
        />
      </Field>
      <div className="flex gap-2">
        <Button
          type="submit"
          className="flex-1"
          disabled={pending || !name.trim()}
          data-testid="onboard.display-name-save"
        >
          {pending ? "saving..." : "Save"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="flex-1"
          onClick={() => setDone(true)}
          disabled={pending}
          data-testid="onboard.display-name-skip"
        >
          Skip
        </Button>
      </div>
    </form>
  );
}

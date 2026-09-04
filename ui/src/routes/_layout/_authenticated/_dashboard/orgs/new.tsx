import { useForm } from "@tanstack/react-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { Users } from "lucide-react";
import { useRef } from "react";
import { toast } from "sonner";
import { useAuthClient } from "@/app";
import {
  Button,
  Card,
  CardContent,
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  Input,
  PageContainer,
  PageHeader,
} from "@/components";
import { deriveSlug } from "@/lib/slug";

export const Route = createFileRoute("/_layout/_authenticated/_dashboard/orgs/new")({
  head: () => ({
    title: "New Organization | auth.everything.dev",
    meta: [{ name: "description", content: "Create a new organization." }],
  }),
  component: NewOrganization,
});

function NewOrganization() {
  const router = useRouter();
  const auth = useAuthClient();
  const queryClient = useQueryClient();
  const slugManuallyEdited = useRef(false);

  const createMutation = useMutation({
    mutationFn: async (values: { name: string; slug: string }) => {
      const { data, error } = await auth.organization.create({
        name: values.name,
        slug: values.slug,
      });
      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: async (data) => {
      toast.success(`Organization "${data?.name}" created`);
      await queryClient.invalidateQueries({ queryKey: ["organizations"] });
      await queryClient.refetchQueries({ queryKey: ["organizations"] });
      if (data?.slug) {
        await router.navigate({
          to: "/orgs/$slug",
          params: { slug: data.slug },
        });
      }
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to create organization");
    },
  });

  const form = useForm({
    defaultValues: {
      name: "",
      slug: "",
    },
    onSubmit: async ({ value }) => {
      await createMutation.mutateAsync(value);
    },
  });

  return (
    <PageContainer variant="wide">
      <div className="space-y-6">
        <PageHeader
          icon={Users}
          label="Teams"
          title="New Organization"
          actions={
            <Button asChild variant="outline">
              <Link to="/orgs">back to organizations</Link>
            </Button>
          }
        />

        <form
          onSubmit={(e) => {
            e.preventDefault();
            form.handleSubmit();
          }}
          className="space-y-6"
        >
          <Card>
            <CardContent className="p-6 space-y-4">
              <form.Field
                name="name"
                validators={{
                  onChange: ({ value }) => (!value.trim() ? "name is required" : undefined),
                }}
              >
                {(field) => {
                  const errors = field.state.meta.isTouched ? field.state.meta.errors : [];
                  return (
                    <Field data-invalid={errors.length > 0 || undefined}>
                      <FieldLabel htmlFor={field.name}>name</FieldLabel>
                      <Input
                        id={field.name}
                        name={field.name}
                        type="text"
                        value={field.state.value}
                        onBlur={field.handleBlur}
                        onChange={(e) => {
                          field.handleChange(e.target.value);
                          form.setFieldValue(
                            "slug",
                            deriveSlug(
                              e.target.value,
                              form.getFieldValue("slug"),
                              slugManuallyEdited.current,
                            ),
                            { dontUpdateMeta: true },
                          );
                        }}
                        placeholder="My Team"
                        aria-invalid={errors.length > 0 || undefined}
                      />
                      {errors.length > 0 ? <FieldError>{errors.join(", ")}</FieldError> : null}
                    </Field>
                  );
                }}
              </form.Field>

              <form.Field
                name="slug"
                validators={{
                  onChange: ({ value }) => {
                    if (!value) return "slug is required";
                    if (!/^[a-z0-9-]+$/.test(value)) {
                      return "only lowercase letters, numbers, and hyphens";
                    }
                    return undefined;
                  },
                }}
              >
                {(field) => {
                  const errors = field.state.meta.isTouched ? field.state.meta.errors : [];
                  return (
                    <Field data-invalid={errors.length > 0 || undefined}>
                      <FieldLabel htmlFor={field.name}>slug</FieldLabel>
                      <Input
                        id={field.name}
                        name={field.name}
                        type="text"
                        value={field.state.value}
                        onBlur={field.handleBlur}
                        onChange={(event) => {
                          slugManuallyEdited.current = true;
                          field.setMeta((meta) => ({ ...meta, isTouched: true }));
                          field.handleChange(event.target.value.replace(/[^a-z0-9-]/g, ""));
                        }}
                        placeholder="my-team"
                        pattern="[a-z0-9-]+"
                        aria-invalid={errors.length > 0 || undefined}
                      />
                      <FieldDescription>
                        Only lowercase letters, numbers, and hyphens.
                      </FieldDescription>
                      {errors.length > 0 ? <FieldError>{errors.join(", ")}</FieldError> : null}
                    </Field>
                  );
                }}
              </form.Field>
            </CardContent>
          </Card>

          <div className="flex gap-2">
            <Button asChild variant="outline">
              <Link to="/orgs">cancel</Link>
            </Button>
            <form.Subscribe
              selector={(state) =>
                state.canSubmit && !!state.values.name.trim() && !!state.values.slug
              }
            >
              {(canSubmit) => (
                <Button
                  type="submit"
                  disabled={createMutation.isPending || !canSubmit}
                  variant="outline"
                >
                  {createMutation.isPending ? "creating..." : "create"}
                </Button>
              )}
            </form.Subscribe>
          </div>
        </form>

        <section className="space-y-4">
          <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
            What Happens Next
          </h2>
          <Card>
            <CardContent className="p-4">
              <ul className="space-y-2 text-xs text-muted-foreground">
                <li>• Your organization will be created immediately</li>
                <li>• You'll be the owner with full permissions</li>
                <li>• You can invite team members from the organization settings</li>
                <li>• You can switch between organizations anytime</li>
              </ul>
            </CardContent>
          </Card>
        </section>
      </div>
    </PageContainer>
  );
}

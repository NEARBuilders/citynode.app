import type {
  ApiInput,
  ApiRef,
  AppDescriptor,
  AppInput,
  AttachmentInput,
  AttachmentRef,
  UiInput,
  UiRef,
} from "./schema";
import { ApiRefSchema, AppDescriptorSchema, AttachmentRefSchema, UiRefSchema } from "./schema";

/**
 * The authored App — returns a pure, Zod-validated, serializable descriptor.
 * Constructors never execute app code (the descriptor IS the deployment plan);
 * resolution and deployment consume it as data.
 */
export function App(input: AppInput): AppDescriptor {
  return AppDescriptorSchema.parse(input);
}

/** The app.api slot. */
export function API(input: ApiInput): ApiRef {
  return ApiRefSchema.parse(input);
}

/** The app.ui slot. */
export function UI(input: UiInput): UiRef {
  return UiRefSchema.parse(input);
}

/**
 * Attach another App — by local workspace path (`Plugin("auth").path("plugins/auth")`)
 * or by published module reference (`Plugin("auth").extends("bos://…")`).
 */
export function Plugin<K extends string>(
  name: K,
): {
  path: (dir: string, extra?: Omit<AttachmentInput, "name" | "path">) => AttachmentRef;
  extends: (ref: string, extra?: Omit<AttachmentInput, "name" | "extends">) => AttachmentRef;
} {
  return {
    path: (dir, extra) => AttachmentRefSchema.parse({ ...extra, name, path: dir }),
    extends: (ref, extra) => AttachmentRefSchema.parse({ ...extra, name, extends: ref }),
  };
}

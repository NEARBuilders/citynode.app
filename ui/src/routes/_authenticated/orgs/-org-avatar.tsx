import { Avatar, AvatarFallback, AvatarImage } from "@/components";
import type { AppTranslator } from "@/i18n/catalogs";
import { translateEnglishAppMessage } from "@/i18n/runtime";
import { presentationLabel } from "@/lib/presentation-label";

export function OrgAvatar({
  name,
  logo,
  size = "default",
}: {
  name: string;
  logo?: string | null;
  size?: "default" | "sm" | "lg";
}) {
  return (
    <Avatar size={size}>
      {logo ? <AvatarImage src={logo} alt="" /> : null}
      <AvatarFallback>{name.charAt(0).toUpperCase()}</AvatarFallback>
    </Avatar>
  );
}

export function roleLabel(
  role: string | null | undefined,
  t: AppTranslator = translateEnglishAppMessage,
) {
  if (role === "official") return t("tenant.official");
  if (role === "community") return t("tenant.communityType");
  return presentationLabel(role ?? "member", t);
}

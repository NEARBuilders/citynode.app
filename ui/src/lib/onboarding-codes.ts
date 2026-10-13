import type { AppTranslator } from "@/i18n/catalogs";
import { translateEnglishAppMessage } from "@/i18n/runtime";
import type { AuthRequestContext } from "@/lib/auth";

export type OnboardingCodeState = "active" | "expired" | "revoked" | "used-up";

export function onboardingCodeState(
  code: { expiresAt: Date; revokedAt: Date | null; usedCount: number; maxUses: number },
  now: number = Date.now(),
): OnboardingCodeState {
  if (code.revokedAt) return "revoked";
  if (new Date(code.expiresAt).getTime() < now) return "expired";
  if (code.usedCount >= code.maxUses) return "used-up";
  return "active";
}

export function isOnboardingOrganizer(context: AuthRequestContext | null | undefined): boolean {
  const role = context?.organization?.member?.role;
  if (!role) return false;
  if (role === "owner" || role === "admin") return true;
  return (context?.organization?.teams ?? []).some((team: { areas: string[] }) =>
    team.areas.includes("events"),
  );
}

export function formatRemaining(
  expiresAt: Date,
  now: number = Date.now(),
  t: AppTranslator = translateEnglishAppMessage,
  locale = "en",
): string {
  const ms = new Date(expiresAt).getTime() - now;
  if (ms <= 0) return t("station.expired");
  const days = Math.floor(ms / 86_400_000);
  const hours = Math.floor((ms % 86_400_000) / 3_600_000);
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  const number = new Intl.NumberFormat(locale);
  const values = {
    days: number.format(days),
    hours: number.format(hours),
    minutes: number.format(minutes),
  };
  if (days > 0) return t("station.daysHours", values);
  if (hours > 0) return t("station.hoursMinutes", values);
  return t("station.minutes", values);
}

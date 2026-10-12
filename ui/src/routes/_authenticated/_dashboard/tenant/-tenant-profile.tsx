import { SectionHeader } from "@/components";
import { ProfileEditor } from "@/components/discovery/profile-editor";
import { useAppTranslation } from "@/i18n/runtime";

export function TenantProfile({ nodeId }: { nodeId: string }) {
  const translate = useAppTranslation();
  return (
    <section id="profile" className="flex scroll-mt-20 flex-col gap-6">
      <SectionHeader
        title={translate("community.profile")}
        description={translate("ownerActions.profileSectionHint")}
        sectionTestId="tenant.section.profile"
      />
      <ProfileEditor nodeId={nodeId} />
    </section>
  );
}

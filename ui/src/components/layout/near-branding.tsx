import builtOnRev from "@/assets/brands/near/build-on-near-dark.png";
import builtOn from "@/assets/brands/near/build-on-near-light.png";
import { useAppTranslation } from "@/i18n/runtime";

export function NearBranding() {
  const translate = useAppTranslation();
  return (
    <a
      href="https://nearbuilders.org"
      target="_blank"
      rel="noopener noreferrer"
      className="relative block h-5 w-21 mx-auto"
    >
      <img
        src={builtOn}
        alt={translate("footer.builtOn")}
        className="absolute inset-0 h-full w-full object-contain dark:hidden"
      />
      <img
        src={builtOnRev}
        alt={translate("footer.builtOn")}
        className="absolute inset-0 hidden h-full w-full object-contain dark:block"
      />
    </a>
  );
}

import type { Metadata } from "next";
import { getServerTranslation } from "@/app/i18n";
import { languages } from "@/app/i18n/settings";

export async function generateMetadata({ params }: { params: Promise<{ lng: string }> }): Promise<Metadata> {
  const { lng } = await params;
  const currentLng = languages.includes(lng) ? lng : languages[0];
  const { t } = await getServerTranslation(currentLng, "common");
  return { title: t("auth.register", { defaultValue: "Register" }) as string };
}


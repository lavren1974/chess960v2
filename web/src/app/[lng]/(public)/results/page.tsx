import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getServerTranslation } from "@/app/i18n";
import { languages } from "@/app/i18n/settings";

// Legacy route kept to preserve old links. Now immediately redirects to All Results.
export const dynamic = "force-dynamic";

export default async function ResultsPage({
  params,
}: {
  params: Promise<{ lng: string }>;
}) {
  const { lng } = await params;
  redirect(`/${lng}/results/all`);
}

export async function generateMetadata({ params }: { params: Promise<{ lng: string }> }): Promise<Metadata> {
  const { lng } = await params;
  const currentLng = languages.includes(lng) ? lng : languages[0];
  const { t } = await getServerTranslation(currentLng, "common");
  return { title: t("nav.results", { defaultValue: "Results" }) as string };
}

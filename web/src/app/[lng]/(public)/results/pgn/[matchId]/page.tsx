import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getServerTranslation } from "@/app/i18n";
import { languages } from "@/app/i18n/settings";

export default async function OldPgnRedirect({
  params,
}: {
  params: Promise<{ lng: string; matchId: string }>;
}) {
  const { lng, matchId } = await params;
  redirect(`/${lng}/results/game/${matchId}`);
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lng: string; matchId: string }>;
}): Promise<Metadata> {
  const { lng, matchId } = await params;
  const currentLng = languages.includes(lng) ? lng : languages[0];
  const { t } = await getServerTranslation(currentLng, "common");
  const gameLabel = t("results.headers.game", { defaultValue: "Game" }) as string;
  return {
    title: `${gameLabel} ${matchId}`,
  };
}

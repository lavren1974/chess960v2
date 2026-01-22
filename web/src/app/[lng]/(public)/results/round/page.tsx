import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getServerTranslation } from "@/app/i18n";
import { languages } from "@/app/i18n/settings";

type SearchParams = Record<string, string | string[]>;

export default async function RoundIndexPage({
  params,
  searchParams,
}: {
  params: Promise<{ lng: string }>;
  searchParams?: Promise<SearchParams>;
}) {
  const { lng } = await params;
  const sp = (searchParams ? await searchParams : {}) as SearchParams;
  const scope = (Array.isArray(sp.scope) ? sp.scope[0] : sp.scope) === "all" ? "all" : null;

  const q = new URLSearchParams();
  if (scope === "all") q.set("scope", "all");
  const query = q.toString();

  redirect(`/${lng}/results/round/1${query ? `?${query}` : ""}`);
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lng: string }>;
}): Promise<Metadata> {
  const { lng } = await params;
  const currentLng = languages.includes(lng) ? lng : languages[0];
  const { t } = await getServerTranslation(currentLng, "common");
  return {
    title: t("results.roundTitle", { id: 1, defaultValue: "Round 1 Results" }) as string,
  };
}

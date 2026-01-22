import { languages } from "@/app/i18n/settings";
import { getServerTranslation } from "@/app/i18n";
import { HomeClient } from "./home-client";
import type { Metadata } from "next";

interface HomeProps {
  params: Promise<{ lng: string }>;
}

export async function generateStaticParams() {
  return languages.map((lng) => ({ lng }));
}

export async function generateMetadata({ params }: HomeProps): Promise<Metadata> {
  const { lng } = await params;
  const currentLng = languages.includes(lng) ? lng : languages[0];
  const { t } = await getServerTranslation(currentLng, "common");
  return {
    title: t("nav.home", { defaultValue: "Home" }) as string,
  };
}

export default async function Home({ params }: HomeProps) {
  const { lng } = await params;
  const currentLng = languages.includes(lng) ? lng : languages[0];

  return <HomeClient lng={currentLng} />;
}

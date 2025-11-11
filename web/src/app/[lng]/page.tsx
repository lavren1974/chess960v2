import { languages } from "@/app/i18n/settings";
import { getServerTranslation } from "@/app/i18n";
import type { Metadata } from "next";
import { HomeClient } from "./home-client";

interface HomeProps {
  params: Promise<{ lng: string }>;
}

export async function generateStaticParams() {
  return languages.map((lng) => ({ lng }));
}

export async function generateMetadata({ params }: { params: Promise<{ lng: string }> }): Promise<Metadata> {
  const { lng } = await params;
  const { t } = await getServerTranslation(lng, "common");
  return { title: t("nav.home") };
}

export default async function Home({ params }: HomeProps) {
  const { lng } = await params;
  const currentLng = languages.includes(lng) ? lng : languages[0];

  return <HomeClient lng={currentLng} />;
}

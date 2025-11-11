import { languages } from "@/app/i18n/settings";
import { getServerTranslation } from "@/app/i18n";
import type { Metadata } from "next";
import { AboutClient } from "./about-client";

interface AboutPageProps {
  params: Promise<{
    lng: string;
  }>;
}

// Generate static params for all supported languages
export async function generateStaticParams() {
  return languages.map((lng) => ({ lng }));
}

export async function generateMetadata({ params }: { params: Promise<{ lng: string }> }): Promise<Metadata> {
  const { lng } = await params;
  const { t } = await getServerTranslation(lng, "common");
  return { title: t("nav.about") };
}

export default async function AboutPage({ params }: AboutPageProps) {
  // Await the params
  const { lng } = await params;

  // If the language is not supported, fallback to the first language from the array (English)
  const currentLng = languages.includes(lng) ? lng : languages[0];

  return <AboutClient lng={currentLng} />;
}

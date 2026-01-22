import { languages } from "@/app/i18n/settings";
import { AboutClient } from "./about-client";
import type { Metadata } from "next";
import { getServerTranslation } from "@/app/i18n";
import { siteConfig } from "@/config/site";

interface AboutPageProps {
  params: Promise<{
    lng: string;
  }>;
}

// Generate static params for all supported languages
export async function generateStaticParams() {
  return languages.map((lng) => ({ lng }));
}

export default async function AboutPage({ params }: AboutPageProps) {
  // Await the params
  const { lng } = await params;

  // If the language is not supported, fallback to the first language from the array (English)
  const currentLng = languages.includes(lng) ? lng : languages[0];

  return <AboutClient lng={currentLng} />;
}

export async function generateMetadata({ params }: AboutPageProps): Promise<Metadata> {
  const { lng } = await params;
  const currentLng = languages.includes(lng) ? lng : languages[0];
  const { t: tCommon } = await getServerTranslation(currentLng, "common");
  const { t: tAbout } = await getServerTranslation(currentLng, "about");
  const title = tCommon("nav.about", { defaultValue: "About" }) as string;
  const description = (tAbout("about.description", { defaultValue: siteConfig.defaultDescription }) as string).trim();
  const url = new URL(`/${currentLng}/about`, siteConfig.siteUrl).toString();
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url,
      type: "website",
      siteName: siteConfig.siteName,
      images: [{ url: siteConfig.defaultOgImage, width: 1200, height: 630, alt: siteConfig.siteName }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [siteConfig.defaultOgImage],
    },
  };
}

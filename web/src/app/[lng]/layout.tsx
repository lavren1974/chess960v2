import { Navbar } from "@/components/ui/navbar";
import { Footer } from "@/components/ui/footer";
import { SupabaseProvider } from "@/components/supabase-provider";
import { getServerClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { dir } from "i18next";
import { languages } from "../i18n/settings";
import { Geist, Geist_Mono } from "next/font/google";
import type { Metadata } from "next";
import { siteConfig } from "@/config/site";
import { I18nProvider } from "@/components/providers/i18n-client-provider";
import Script from "next/script";
import "../globals.css";
import { getServerTranslation } from "@/app/i18n";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
  preload: false,
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
  preload: false,
});

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lng: string }>;
}): Promise<Metadata> {
  const { lng } = await params;
  const currentLng = languages.includes(lng) ? lng : languages[0];
  const { t } = await getServerTranslation(currentLng, "common");
  const description = t("meta.defaultDescription", {
    defaultValue: siteConfig.defaultDescription,
  }) as string;

  return {
    metadataBase: new URL(siteConfig.siteUrl),
    title: {
      default: siteConfig.siteName,
      template: `${siteConfig.siteName} ♟ %s`,
    },
    description,
    openGraph: {
      type: "website",
      url: siteConfig.siteUrl,
      siteName: siteConfig.siteName,
      title: siteConfig.siteName,
      description,
      images: [{ url: siteConfig.defaultOgImage, width: 1200, height: 630, alt: siteConfig.siteName }],
    },
    twitter: {
      card: "summary_large_image",
      title: siteConfig.siteName,
      description,
      images: [siteConfig.defaultOgImage],
    },
  };
}

export async function generateStaticParams() {
  return languages.map((lng) => ({ lng }));
}

interface RootLayoutProps {
  children: React.ReactNode;
  params: Promise<{
    lng: string;
  }>;
}

export default async function RootLayout({
  children,
  params,
}: RootLayoutProps) {
  const { lng } = await params;
  const supabase = await getServerClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user ?? null;

  return (
    <html
      lang={lng}
      dir={dir(lng)}
      className={cn(geistSans.className, geistMono.variable, "antialiased h-full")}
      suppressHydrationWarning
    >
      <head>
        <meta name="darkreader-lock" />
        {/* <script
          defer
          data-domain="chess960v2.com"
          src="https://stats.chess960v2.com/js/script.js"
        ></script> */}

         {/* Plausible script */}
        <Script
          src="https://stats.mystack.host/js/pa-pJ1lvCLZTF3xy6SguJGMx.js"
          strategy="afterInteractive"
        />

        {/* Plausible init */}
        <Script id="plausible-init" strategy="afterInteractive">
          {`
            window.plausible = window.plausible || function () {
              (plausible.q = plausible.q || []).push(arguments);
            };
            plausible.init = plausible.init || function (i) {
              plausible.o = i || {};
            };
            plausible.init();
          `}
        </Script>
      </head>
      <body className="min-h-screen flex flex-col bg-base-100" suppressHydrationWarning>
        <I18nProvider lng={lng} namespaces={["common"]}>
          <SupabaseProvider initialSession={null} initialUser={user}>
            <Navbar lng={lng} />
            <main className="grow">
              <div className="mx-auto max-w-7xl px-4 py-12">{children}</div>
            </main>
            <Footer lng={lng} />
          </SupabaseProvider>
        </I18nProvider>
      </body>
    </html>
  );
}

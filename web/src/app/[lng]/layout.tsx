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
import "../globals.css";

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

export const metadata: Metadata = {
  title: {
    default: siteConfig.siteName,
    template: `${siteConfig.siteName} | %s`,
  },
  description: `A simple example built on ${siteConfig.siteName}`,
};

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

  const [{ data: sessionData }, { data: userData }] = await Promise.all([
    supabase.auth.getSession(),
    supabase.auth.getUser(),
  ]);

  const session = sessionData.session;
  // Trust only getUser() on the server; avoid falling back to session.user
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
        <script
          defer
          data-domain="chess960v2.com"
          src="https://stats.chess960v2.com/js/script.js"
        ></script>
      </head>
      <body className="min-h-screen flex flex-col bg-base-100" suppressHydrationWarning>
        <I18nProvider lng={lng} namespaces={["common"]}>
          <SupabaseProvider initialSession={session} initialUser={user}>
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

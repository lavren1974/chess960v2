import { getServerTranslation } from "@/app/i18n";
import { languages } from "@/app/i18n/settings";
import { getNewsSummaries } from "@/lib/news";
import Link from "next/link";
import type { Metadata } from "next";
import { Newspaper } from "lucide-react";
import { siteConfig } from "@/config/site";

interface NewsPageProps {
  params: Promise<{
    lng: string;
  }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateStaticParams() {
  return languages.map((lng) => ({ lng }));
}

export default async function NewsPage({ params, searchParams }: NewsPageProps) {
  const { lng } = await params;
  const sp = searchParams ? await searchParams : {};
  const currentLng = languages.includes(lng) ? lng : languages[0];
  const { t } = await getServerTranslation(currentLng, "news");
  const { t: tCommon } = await getServerTranslation(currentLng, "common");
  const pageSize = 5;
  const rawPage = Array.isArray(sp.page) ? sp.page[0] : sp.page;
  const parsedPage = rawPage ? Number.parseInt(rawPage, 10) : 1;
  const page = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;

  const allNews = getNewsSummaries(currentLng, Number.MAX_SAFE_INTEGER);
  const total = allNews.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const clampedPage = Math.min(page, totalPages);
  const offset = (clampedPage - 1) * pageSize;
  const newsItems = allNews.slice(offset, offset + pageSize);

  const formatter = new Intl.DateTimeFormat(currentLng, { dateStyle: "medium" });
  const formatDate = (value: string) => {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return value;
    return formatter.format(parsed);
  };

  return (
    <div className="space-y-8">
      <header className="space-y-3 text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-base-300/60 text-sm mx-auto">
          <Newspaper className="size-4 text-primary" />
          <span className="font-medium">{t("badge")}</span>
        </div>
        <h1 className="sr-only">{tCommon("nav.news", { defaultValue: "News" })}</h1>
      </header>

      {newsItems.length === 0 ? (
        <div className="alert alert-info">
          <span>{t("empty")}</span>
        </div>
      ) : (
        <div className="grid gap-4">
          {newsItems.map((item) => (
            <Link key={item.slug} href={`/${currentLng}/news/${item.slug}`} className="group block">
              <article className="card bg-base-100 shadow-md border border-base-200 transition hover:border-primary/60 hover:shadow-lg">
                {item.heroImage ? (
                  <figure className="border-b border-base-200 bg-base-200/30">
                    <img
                      src={item.heroImage}
                      alt={item.title}
                      className="h-48 w-full object-cover"
                      loading="lazy"
                    />
                  </figure>
                ) : null}
                <div className="card-body space-y-3">
                  <div className="flex flex-wrap items-center justify-between text-sm text-base-content/70 gap-2">
                    <span>{formatDate(item.date)}</span>
                    <div className="flex items-center gap-2">
                      {item.draft ? <span className="badge badge-warning badge-outline">{t("draft", { defaultValue: "Draft" })}</span> : null}
                      {item.locale !== currentLng ? <span className="badge badge-outline">{t("fallback")}</span> : null}
                    </div>
                  </div>
                  <h2 className="card-title text-xl group-hover:text-primary">{item.title}</h2>
                  <p className="text-base-content/80">{item.announcement}</p>
                </div>
              </article>
            </Link>
          ))}
        </div>
      )}

      {totalPages > 1 ? (
        <div className="flex flex-col gap-3 border-t border-base-200 pt-4">
          <div className="text-sm text-base-content/70 text-center">
            {t("pageStatus", {
              page: clampedPage,
              total: totalPages,
              defaultValue: `Page ${clampedPage} of ${totalPages}`,
            })}
          </div>
          <div className="flex items-center justify-center gap-2 flex-wrap">
            <Link
              href={{ pathname: `/${currentLng}/news`, query: { page: 1 } }}
              className={`btn btn-sm ${clampedPage === 1 ? "btn-disabled" : "btn-outline"}`}
            >
              {t("first", { defaultValue: "First" })}
            </Link>
            <Link
              href={{ pathname: `/${currentLng}/news`, query: { page: Math.max(1, clampedPage - 1) } }}
              className={`btn btn-sm ${clampedPage === 1 ? "btn-disabled" : "btn-outline"}`}
            >
              {t("previous", { defaultValue: "Previous" })}
            </Link>
            <span className="px-3 py-1 text-sm rounded-md bg-base-200">
              {t("pageStatus", {
                page: clampedPage,
                total: totalPages,
                defaultValue: `Page ${clampedPage} of ${totalPages}`,
              })}
            </span>
            <Link
              href={{ pathname: `/${currentLng}/news`, query: { page: Math.min(totalPages, clampedPage + 1) } }}
              className={`btn btn-sm ${clampedPage === totalPages ? "btn-disabled" : "btn-outline"}`}
            >
              {t("next", { defaultValue: "Next" })}
            </Link>
            <Link
              href={{ pathname: `/${currentLng}/news`, query: { page: totalPages } }}
              className={`btn btn-sm ${clampedPage === totalPages ? "btn-disabled" : "btn-outline"}`}
            >
              {t("last", { defaultValue: "Last" })}
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export async function generateMetadata({ params }: NewsPageProps): Promise<Metadata> {
  const { lng } = await params;
  const currentLng = languages.includes(lng) ? lng : languages[0];
  const { t: tCommon } = await getServerTranslation(currentLng, "common");
  const title = tCommon("nav.news", { defaultValue: "News" }) as string;
  const description = tCommon("meta.defaultDescription", {
    defaultValue: siteConfig.defaultDescription,
  }) as string;
  const url = new URL(`/${currentLng}/news`, siteConfig.siteUrl).toString();
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

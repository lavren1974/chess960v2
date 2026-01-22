import { getServerTranslation } from "@/app/i18n";
import { languages } from "@/app/i18n/settings";
import { getNewsArticle, getNewsSlugs } from "@/lib/news";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { siteConfig } from "@/config/site";

interface NewsArticlePageProps {
  params: Promise<{
    lng: string;
    slug: string;
  }>;
}

export async function generateStaticParams() {
  const slugs = getNewsSlugs();
  const params: { lng: string; slug: string }[] = [];

  for (const lng of languages) {
    for (const slug of slugs) {
      params.push({ lng, slug });
    }
  }

  return params;
}

export default async function NewsArticlePage({ params }: NewsArticlePageProps) {
  const { lng, slug } = await params;
  const currentLng = languages.includes(lng) ? lng : languages[0];
  const article = getNewsArticle(slug, currentLng);

  if (!article) notFound();

  const { t } = await getServerTranslation(currentLng, "news");
  const formatter = new Intl.DateTimeFormat(currentLng, { dateStyle: "medium" });
  const formattedDate = formatter.format(new Date(article.date));

  type ContentBlock =
    | { type: "paragraph"; text: string }
    | { type: "heading"; level: number; text: string }
    | { type: "list"; ordered: boolean; items: string[] }
    | { type: "hr" }
    | { type: "image"; alt: string; src: string; width?: number; height?: number };

  const resolveImageSrc = (raw: string) => {
    const cleaned = raw.trim();
    if (/^https?:\/\//i.test(cleaned)) return cleaned;
    const normalized = cleaned.replace(/^\.\//, "");

    // Treat leading /img/... as news-local assets for convenience.
    if (normalized.startsWith("/img/")) {
      const relativePath = normalized.replace(/^\/+/, "");
      const encodedLocal = relativePath
        .split("/")
        .filter(Boolean)
        .map((segment) => encodeURIComponent(segment))
        .join("/");
      return `/news-assets/${article.slug}/${encodedLocal}`;
    }

    if (normalized.startsWith("/")) return normalized;

    const encoded = normalized
      .split("/")
      .filter(Boolean)
      .map((segment) => encodeURIComponent(segment))
      .join("/");
    return `/news-assets/${article.slug}/${encoded}`;
  };

  const parseSizeHint = (value: string): { cleaned: string; width?: number; height?: number } => {
    const trimmed = value.trim();
    const sizeMatch = trimmed.match(/^(.*?)[#|]\s*(\d+)\s*x\s*(\d+)\s*$/);
    const equalsMatch = trimmed.match(/^(.*?)=\s*(\d+)\s*x\s*(\d+)\s*$/);
    const target = sizeMatch || equalsMatch;
    if (target) {
      const [, pathPart, w, h] = target;
      return { cleaned: pathPart.trim(), width: Number(w), height: Number(h) };
    }
    return { cleaned: trimmed };
  };

  const blocks: ContentBlock[] = [];
  let paragraph: string[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;

  const pushParagraph = () => {
    if (paragraph.length === 0) return;
    const text = paragraph.join(" ").trim();
    if (text) blocks.push({ type: "paragraph", text });
    paragraph = [];
  };

  const pushList = () => {
    if (!list) return;
    if (list.items.length > 0) blocks.push({ type: "list", ordered: list.ordered, items: list.items });
    list = null;
  };

  const renderInline = (text: string) => {
    const nodes: Array<string | ReactNode> = [];
    const pattern = /(\*\*[^*]+\*\*|\*[^*]+\*|_[^_]+_|\[[^\]]+\]\([^)]+\)|(https?:\/\/[^\s)]+))/g;
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    let key = 0;

    while ((match = pattern.exec(text)) !== null) {
      if (match.index > lastIndex) {
        nodes.push(text.slice(lastIndex, match.index));
      }

      const token = match[0];
      if (token.startsWith("**")) {
        nodes.push(<strong key={`strong-${key++}`}>{token.slice(2, -2)}</strong>);
      } else if (token.startsWith("*")) {
        nodes.push(<em key={`em-${key++}`}>{token.slice(1, -1)}</em>);
      } else if (token.startsWith("_")) {
        nodes.push(<em key={`em-${key++}`}>{token.slice(1, -1)}</em>);
      } else if (token.startsWith("[")) {
        const linkMatch = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
        if (linkMatch) {
          const [, label, href] = linkMatch;
          nodes.push(
            <a key={`link-${key++}`} href={href} className="link link-primary">
              {label}
            </a>
          );
        } else {
          nodes.push(token);
        }
      } else if (token.startsWith("http")) {
        nodes.push(
          <a key={`link-${key++}`} href={token} className="link link-primary">
            {token}
          </a>
        );
      } else {
        nodes.push(token);
      }

      lastIndex = match.index + token.length;
    }

    if (lastIndex < text.length) {
      nodes.push(text.slice(lastIndex));
    }

    return nodes;
  };

  for (const line of article.content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) {
      pushParagraph();
      pushList();
      continue;
    }

    const markdownImgMatch = trimmed.match(/^!\[(.*?)]\((.+)\)$/);
    if (markdownImgMatch) {
      pushParagraph();
      pushList();
      const alt = markdownImgMatch[1].trim() || article.title;
      const { cleaned, width, height } = parseSizeHint(markdownImgMatch[2]);
      const src = resolveImageSrc(cleaned);
      blocks.push({ type: "image", alt, src, width, height });
      continue;
    }

    const htmlImgMatch = trimmed.match(/^<img\s+[^>]*src=["']?([^"'>\s]+)["']?[^>]*>/i);
    if (htmlImgMatch) {
      pushParagraph();
      pushList();
      const src = resolveImageSrc(htmlImgMatch[1]);
      const altMatch = trimmed.match(/alt=["']([^"']+)["']/i);
      const widthMatch = trimmed.match(/width=["'](\d+)["']/i);
      const heightMatch = trimmed.match(/height=["'](\d+)["']/i);
      const alt = altMatch ? altMatch[1] : article.title;
      const width = widthMatch ? Number(widthMatch[1]) : undefined;
      const height = heightMatch ? Number(heightMatch[1]) : undefined;
      blocks.push({ type: "image", alt, src, width, height });
      continue;
    }

    const headingMatch = trimmed.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      pushParagraph();
      pushList();
      const level = headingMatch[1].length;
      const text = headingMatch[2].trim();
      if (text) blocks.push({ type: "heading", level, text });
      continue;
    }

    const hrMatch = trimmed.match(/^(-{3,}|_{3,}|\*{3,})$/);
    if (hrMatch) {
      pushParagraph();
      pushList();
      blocks.push({ type: "hr" });
      continue;
    }

    const orderedMatch = trimmed.match(/^\d+\.\s+(.*)$/);
    if (orderedMatch) {
      pushParagraph();
      if (!list || !list.ordered) {
        pushList();
        list = { ordered: true, items: [] };
      }
      list.items.push(orderedMatch[1].trim());
      continue;
    }

    const unorderedMatch = trimmed.match(/^[-*+]\s+(.*)$/);
    if (unorderedMatch) {
      pushParagraph();
      if (!list || list.ordered) {
        pushList();
        list = { ordered: false, items: [] };
      }
      list.items.push(unorderedMatch[1].trim());
      continue;
    }

    pushList();
    paragraph.push(trimmed);
  }
  pushParagraph();
  pushList();

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      <div className="space-y-3">
        <div className="flex items-center gap-3 text-sm text-base-content/70">
          <Link href={`/${currentLng}/news`} className="link link-primary">
            {t("back", { defaultValue: "Back to news" })}
          </Link>
          <div className="flex items-center gap-2">
            {article.draft ? <span className="badge badge-warning badge-outline">{t("draft", { defaultValue: "Draft" })}</span> : null}
            {article.locale !== currentLng ? <span className="badge badge-outline">{t("fallback")}</span> : null}
          </div>
        </div>
        <h1 className="text-4xl md:text-5xl font-bold leading-tight">{article.title}</h1>
        <p className="text-base-content/70">{formattedDate}</p>
      </div>

      <div className="space-y-4 text-lg leading-relaxed text-base-content/80">
        {blocks.map((block, idx) => {
          if (block.type === "image") {
            return (
              <div key={idx} className="flex justify-center">
                <div className="overflow-hidden rounded-xl border border-base-200 shadow-sm">
                  <a href={block.src} target="_blank" rel="noreferrer">
                    <img
                      src={block.src}
                      alt={block.alt}
                      width={block.width}
                      height={block.height}
                      className="h-auto"
                      style={block.width ? { width: `${block.width}px` } : undefined}
                    />
                  </a>
                </div>
              </div>
            );
          }
          if (block.type === "heading") {
            const tagName = `h${Math.min(Math.max(block.level, 2), 4)}`;
            const headingClass =
              block.level <= 2 ? "text-2xl md:text-3xl font-semibold" : "text-xl md:text-2xl font-semibold";
            return (
              <div key={idx} className={headingClass} data-heading-level={tagName}>
                {renderInline(block.text)}
              </div>
            );
          }
          if (block.type === "list") {
            const ListTag = block.ordered ? "ol" : "ul";
            const listClass = block.ordered ? "list-decimal" : "list-disc";
            return (
              <ListTag key={idx} className={`${listClass} pl-6 space-y-2`}>
                {block.items.map((item, itemIdx) => (
                  <li key={itemIdx}>{renderInline(item)}</li>
                ))}
              </ListTag>
            );
          }
          if (block.type === "hr") {
            return <hr key={idx} className="border-base-300" />;
          }
          return <p key={idx}>{renderInline(block.text)}</p>;
        })}
      </div>
    </div>
  );
}

export async function generateMetadata({ params }: NewsArticlePageProps): Promise<Metadata> {
  const { lng, slug } = await params;
  const currentLng = languages.includes(lng) ? lng : languages[0];
  const article = getNewsArticle(slug, currentLng);
  const { t: tCommon } = await getServerTranslation(currentLng, "common");

  const newsLabel = tCommon("nav.news", { defaultValue: "News" }) as string;
  if (!article) {
    return { title: `${newsLabel}` };
  }

  const description =
    article.announcement ||
    (tCommon("meta.defaultDescription", {
      defaultValue: siteConfig.defaultDescription,
    }) as string);
  const url = new URL(`/${currentLng}/news/${article.slug}`, siteConfig.siteUrl).toString();
  const image = article.heroImage
    ? new URL(article.heroImage, siteConfig.siteUrl).toString()
    : new URL(siteConfig.defaultOgImage, siteConfig.siteUrl).toString();

  return {
    title: `${article.title} • ${newsLabel}`,
    description,
    openGraph: {
      title: article.title,
      description,
      type: "article",
      url,
      siteName: siteConfig.siteName,
      images: [{ url: image, width: 1200, height: 630, alt: article.title }],
    },
    twitter: {
      card: "summary_large_image",
      title: article.title,
      description,
      images: [image],
    },
  };
}

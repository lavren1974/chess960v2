import "server-only";
import fs from "fs";
import path from "path";
import { fallbackLng, languages } from "@/app/i18n/settings";

export interface NewsSummary {
  slug: string;
  title: string;
  announcement: string;
  date: string;
  locale: string;
  timestamp: number;
  draft?: boolean;
  heroImage?: string | null;
}

export interface NewsArticle extends NewsSummary {
  content: string;
  heroImage?: string | null;
}

const NEWS_DIR = path.join(process.cwd(), "news");

type Frontmatter = Record<string, string>;

function parseFrontmatter(raw: string): { data: Frontmatter; content: string } {
  if (!raw.startsWith("---")) return { data: {}, content: raw };
  const end = raw.indexOf("\n---");
  if (end === -1) return { data: {}, content: raw };
  const fmBlock = raw.slice(3, end).trim();
  const content = raw.slice(end + 4).trimStart();
  const data: Frontmatter = {};
  for (const line of fmBlock.split(/\r?\n/)) {
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    if (!key) continue;
    let value = line.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    data[key] = value;
  }
  return { data, content };
}

function parseDateFromSlug(slug: string): string | null {
  const m = slug.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}

function parseBoolean(value: string | undefined): boolean | undefined {
  if (value === undefined) return undefined;
  const normalized = value.trim().toLowerCase();
  if (["true", "1", "yes", "y", "on"].includes(normalized)) return true;
  if (["false", "0", "no", "n", "off"].includes(normalized)) return false;
  return undefined;
}

function normalizeLocale(locale: string) {
  return languages.includes(locale) ? locale : fallbackLng;
}

function includeDrafts() {
  return process.env.NODE_ENV !== "production";
}

export function getNewsSlugs(): string[] {
  if (!fs.existsSync(NEWS_DIR)) return [];
  const allowDrafts = includeDrafts();
  return fs
    .readdirSync(NEWS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .filter((slug) => {
      if (allowDrafts) return true;
      // Drop drafts when not allowed by checking frontmatter of fallback locale file (if exists)
      const candidate = path.join(NEWS_DIR, slug, `${fallbackLng}.md`);
      const localized = path.join(NEWS_DIR, slug, `${languages[0]}.md`);
      const filePath = fs.existsSync(candidate) ? candidate : fs.existsSync(localized) ? localized : null;
      if (!filePath) return true;
      try {
        const raw = fs.readFileSync(filePath, "utf8");
        const { data } = parseFrontmatter(raw);
        return parseBoolean(data.draft) !== true;
      } catch {
        return true;
      }
    });
}

function resolveNewsFile(slug: string, locale: string): { filePath: string | null; usedLocale: string } {
  const normalizedLng = normalizeLocale(locale);
  const slugDir = path.join(NEWS_DIR, slug);
  if (!fs.existsSync(slugDir)) return { filePath: null, usedLocale: normalizedLng };

  const candidates = [normalizedLng, fallbackLng].filter((lng, idx, arr) => arr.indexOf(lng) === idx);
  for (const lng of candidates) {
    const candidate = path.join(slugDir, `${lng}.md`);
    if (fs.existsSync(candidate)) {
      return { filePath: candidate, usedLocale: lng };
    }
  }

  return { filePath: null, usedLocale: normalizedLng };
}

function deriveTimestamp(dateStr: string | null, filePath: string): { iso: string; ts: number } {
  const statDate = fs.statSync(filePath).mtime;
  if (dateStr) {
    const parsed = new Date(dateStr);
    if (!Number.isNaN(parsed.getTime())) {
      return { iso: parsed.toISOString(), ts: parsed.getTime() };
    }
  }
  return { iso: statDate.toISOString(), ts: statDate.getTime() };
}

function extractAnnouncement(content: string): string {
  const lines = content.split(/\r?\n/);
  const chunks: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed && chunks.length > 0) break;
    if (trimmed) chunks.push(trimmed);
  }
  return chunks.join(" ");
}

export function getNewsSummaries(locale: string, limit = 10, offset = 0): NewsSummary[] {
  if (!fs.existsSync(NEWS_DIR)) return [];

  const normalizedLng = normalizeLocale(locale);
  const dirs = getNewsSlugs();
  const summaries: NewsSummary[] = [];
  const allowDrafts = includeDrafts();

  for (const slug of dirs) {
    const { filePath, usedLocale } = resolveNewsFile(slug, normalizedLng);
    if (!filePath) continue;

    try {
      const raw = fs.readFileSync(filePath, "utf8");
      const { data, content } = parseFrontmatter(raw);
      const title = (data.title || slug).trim();
      const announcement = (data.announcement || extractAnnouncement(content) || slug).trim();
      const dateFromSlug = parseDateFromSlug(slug);
      const { iso, ts } = deriveTimestamp(data.date || dateFromSlug, filePath);
      const heroImage = findHeroImage(slug);
      const draft = parseBoolean(data.draft);
      if (!allowDrafts && draft) continue;

      summaries.push({
        slug,
        title,
        announcement,
        date: iso,
        locale: usedLocale,
        timestamp: ts,
        draft,
        heroImage,
      });
    } catch {
      // ignore malformed files
    }
  }

  const sorted = summaries.sort((a, b) => b.timestamp - a.timestamp);
  if (offset <= 0 && limit === Number.MAX_SAFE_INTEGER) return sorted;
  return sorted.slice(offset, offset + limit);
}

const HERO_IMAGE_CANDIDATES = ["1.jpg", "1.jpeg", "1.png", "1.webp"];
const HERO_IMAGE_REGEX = /\.(png|jpe?g|webp)$/i;

function findHeroImage(slug: string): string | null {
  const imgDir = path.join(NEWS_DIR, slug, "img");
  if (!fs.existsSync(imgDir)) return null;

  for (const name of HERO_IMAGE_CANDIDATES) {
    const filePath = path.join(imgDir, name);
    if (fs.existsSync(filePath)) return `/news-assets/${slug}/img/${name}`;
  }

  const firstImage = fs.readdirSync(imgDir).find((entry) => HERO_IMAGE_REGEX.test(entry));
  if (firstImage) {
    return `/news-assets/${slug}/img/${firstImage}`;
  }

  return null;
}

export function getNewsArticle(slug: string, locale: string): NewsArticle | null {
  const normalizedLng = normalizeLocale(locale);
  const { filePath, usedLocale } = resolveNewsFile(slug, normalizedLng);
  if (!filePath) return null;
  const allowDrafts = includeDrafts();

  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const { data, content } = parseFrontmatter(raw);
    const title = (data.title || slug).trim();
    const announcement = (data.announcement || extractAnnouncement(content) || slug).trim();
    const dateFromSlug = parseDateFromSlug(slug);
    const { iso, ts } = deriveTimestamp(data.date || dateFromSlug, filePath);
    const heroImage = findHeroImage(slug);
    const draft = parseBoolean(data.draft);
    if (!allowDrafts && draft) return null;

    return {
      slug,
      title,
      announcement,
      date: iso,
      locale: usedLocale,
      timestamp: ts,
      content: content.trim(),
      heroImage,
      draft,
    };
  } catch {
    return null;
  }
}

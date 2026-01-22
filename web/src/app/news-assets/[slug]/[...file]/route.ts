import fs from "fs";
import path from "path";
import { NextResponse } from "next/server";

const NEWS_DIR = path.join(process.cwd(), "news");

const MIME_MAP: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

function isPathInside(parent: string, child: string) {
  const normalizedParent = path.resolve(parent) + path.sep;
  const normalizedChild = path.resolve(child);
  return normalizedChild.startsWith(normalizedParent);
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string; file: string[] }> },
) {
  const { slug, file } = await params;
  if (!slug || !file || file.length === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const filePath = path.join(NEWS_DIR, slug, ...file);

  if (!isPathInside(NEWS_DIR, filePath) || !fs.existsSync(filePath)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const ext = path.extname(filePath).toLowerCase();
  const mime = MIME_MAP[ext] || "application/octet-stream";
  const data = await fs.promises.readFile(filePath);

  return new NextResponse(data, {
    status: 200,
    headers: {
      "Content-Type": mime,
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}

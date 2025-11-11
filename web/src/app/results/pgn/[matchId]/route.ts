import { fallbackLng } from "@/app/i18n/settings";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ matchId: string }> },
) {
  const { matchId } = await params;
  const url = new URL(req.url);
  url.pathname = `/${fallbackLng}/results/game/${matchId}`;
  return Response.redirect(url, 307);
}

import { getServerClient } from "@/lib/supabase/server";
import { LiveStandings } from "@/components/standings/live-standings";
import { getServerTranslation } from "@/app/i18n";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import type { AgentRow } from "@/components/agents/agent-utils";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ lng: string }> }): Promise<Metadata> {
  const { lng } = await params;
  const { t } = await getServerTranslation(lng, "common");
  return { title: t("standings.title") };
}

export default async function StandingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ lng: string }>;
  searchParams?: Promise<Record<string, string | string[]>>;
}) {
  const { lng } = await params;
  const sp = (searchParams ? await searchParams : {}) as Record<string, string | string[]>;
  const supabase = await getServerClient();
  const { t } = await getServerTranslation(lng, "common");

  function parsePositiveInt(v: unknown, fallback: number): number {
    const n = typeof v === "string" ? parseInt(v, 10) : NaN;
    return Number.isFinite(n) && n > 0 ? n : fallback;
  }

  const perPageDefault = 60;
  const perPageRaw = sp.perPage ?? String(perPageDefault);
  const perPageInput = Array.isArray(perPageRaw) ? perPageRaw[0] : perPageRaw;
  let perPage = parsePositiveInt(perPageInput, perPageDefault);

  const pageRaw = sp.page ?? "1";
  const pageInput = Array.isArray(pageRaw) ? pageRaw[0] : pageRaw;
  let page = parsePositiveInt(pageInput, 1);

  const viewRaw = sp.view ?? "all";
  const viewInput = (Array.isArray(viewRaw) ? viewRaw[0] : viewRaw) as string;
  let view: "all" | "white" | "black" = "all";
  let needsRedirect = false;
  if (viewInput === "white" || viewInput === "black" || viewInput === "all") {
    view = viewInput;
  } else {
    if (viewInput.startsWith("white")) view = "white";
    else if (viewInput.startsWith("black")) view = "black";
    else if (viewInput.startsWith("all")) view = "all";
    const mPage = viewInput.match(/page=(\d+)/i);
    const mPer = viewInput.match(/perPage=(\d+)/i);
    if (mPage) page = parsePositiveInt(mPage[1], page);
    if (mPer) perPage = parsePositiveInt(mPer[1], perPage);
    needsRedirect = true; // malformed view contained extra pieces
  }

  // If any param was concatenated into other keys, normalize the URL
  if (
    needsRedirect ||
    (typeof pageRaw === "string" && /perPage=/.test(pageRaw)) ||
    (typeof perPageInput === "string" && /page=/.test(perPageInput))
  ) {
    const q = new URLSearchParams();
    q.set("view", view);
    q.set("page", String(page));
    q.set("perPage", String(perPage));
    redirect(`/${lng}/standings?${q.toString()}`);
  }

  const from = (page - 1) * perPage;
  const to = from + perPage - 1;

  // Try to detect the latest active championship
  const { data: champs } = await supabase
    .from("championships")
    .select("id, status, start_date")
    .eq("status", "active")
    .order("start_date", { ascending: false })
    .limit(1);

  const champId = champs && champs.length > 0 ? champs[0].id : null;

  let initial: any[] = [];
  let errorMessage: string | null = null;
  let total = 0;

  // Fetch current page with total count for current view
  {
    let scoped = supabase
      .from("standings")
      .select(
        "id, player_id, games_played, wins, draws, losses, points, bergvizer_score, championship_id",
        { count: "exact" },
      );
    if (champId) scoped = scoped.eq("championship_id", champId);
    if (view === "white") scoped = scoped.gte("player_id", 1000).lte("player_id", 1959);
    if (view === "black") scoped = scoped.gte("player_id", 2000).lte("player_id", 2959);
    scoped = scoped
      .order("points", { ascending: false })
      .order("bergvizer_score", { ascending: false, nullsFirst: false })
      .order("games_played", { ascending: false })
      .order("player_id", { ascending: true })
      .range(from, to);

    const { data, error, count } = await scoped;
    if (Array.isArray(data)) initial = data;
    if (typeof count === "number") total = count;
    if (error) errorMessage = error.message;
  }

  // Fetch counts for tabs (all/white/black)
  async function countFor(scope: "all" | "white" | "black") {
    let q = supabase.from("standings").select("id", { count: "exact", head: true });
    if (champId) q = q.eq("championship_id", champId);
    if (scope === "white") q = q.gte("player_id", 1000).lte("player_id", 1959);
    if (scope === "black") q = q.gte("player_id", 2000).lte("player_id", 2959);
    const { count } = await q;
    return typeof count === "number" ? count : 0;
  }

  const [countAll, countWhite, countBlack] = await Promise.all([
    countFor("all"),
    countFor("white"),
    countFor("black"),
  ]);

  // Fetch agent display info for current page slice
  let agentsMap: Record<number, AgentRow> = {};
  if (initial.length > 0) {
    const ids = initial.map((r) => r.player_id);
    const { data: agents } = await supabase
      .from("agents")
      .select("id, sp_id, mini_fen, color")
      .in("id", ids);
    if (Array.isArray(agents)) {
      agentsMap = Object.fromEntries(
        (agents as unknown as AgentRow[]).map((a) => [a.id, a]),
      );
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t("standings.title")}</h1>
      <LiveStandings
        initial={initial}
        champId={champId}
        lng={lng}
        perPage={perPage}
        page={page}
        total={total}
        counts={{ all: countAll, white: countWhite, black: countBlack }}
        view={view}
        agents={agentsMap}
      />
      {errorMessage ? (
        <p className="text-sm text-warning">Unable to fetch standings ({errorMessage}).</p>
      ) : null}
    </div>
  );
}

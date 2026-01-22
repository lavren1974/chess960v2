import { getServerClient } from "@/lib/supabase/server";
import { getServiceRoleClient } from "@/lib/supabase/service";
import { LiveStandings } from "@/components/standings/live-standings";
import { getServerTranslation } from "@/app/i18n";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { languages } from "@/app/i18n/settings";
import type { AgentRow } from "@/components/agents/agent-utils";

export const dynamic = "force-dynamic";

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
  const service = getServiceRoleClient();
  const { t } = await getServerTranslation(lng, "common");
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  const favoritesLoginPrompt = t("standings.favoritesLoginPrompt", {
    defaultValue: "Sign in to view favorite positions.",
  });
  const loginLabel = t("nav.login", { defaultValue: "Login" });

  function parsePositiveInt(v: unknown, fallback: number): number {
    const n = typeof v === "string" ? parseInt(v, 10) : NaN;
    return Number.isFinite(n) && n > 0 ? n : fallback;
  }

  const perPageDefault = 60;
  const perPageRaw = sp.perPage ?? String(perPageDefault);
  const perPageInput = Array.isArray(perPageRaw) ? perPageRaw[0] : perPageRaw;
  let perPage = parsePositiveInt(perPageInput, perPageDefault);

  const champRaw = sp.champ ?? sp.championship ?? null;
  const champInput = Array.isArray(champRaw) ? champRaw[0] : champRaw;
  const requestedChamp = parsePositiveInt(champInput, NaN);

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

  const favoritesRaw = sp.favorites ?? sp.fav ?? null;
  const favoritesInput = Array.isArray(favoritesRaw) ? favoritesRaw[0] : favoritesRaw;
  const favoritesOnlyRequested =
    typeof favoritesInput === "string" &&
    ["1", "true", "yes", "on"].includes(favoritesInput.toLowerCase());
  const canUseFavorites = Boolean(user);
  const favoritesOnly = canUseFavorites && favoritesOnlyRequested;
  if (favoritesOnlyRequested && !canUseFavorites) needsRedirect = true;

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
    if (Number.isFinite(requestedChamp)) q.set("champ", String(requestedChamp));
    if (favoritesOnly) q.set("favorites", "1");
    redirect(`/${lng}/standings?${q.toString()}`);
  }

  const from = (page - 1) * perPage;
  const to = from + perPage - 1;

  // Fetch all championships to power the selector and pick a default
  const { data: champs } = await service
    .from("sf_championships")
    .select("id, status, start_date")
    .order("start_date", { ascending: false });

  const championships = Array.isArray(champs) ? champs : [];
  const champIdSet = new Set(championships.map((c) => c.id));

  const envDefaultChamp = parsePositiveInt(process.env.DEFAULT_CHAMPIONSHIP_ID, NaN);
  const latestActiveChamp =
    championships.find((c) => c.status === "active")?.id ??
    (championships.length > 0 ? championships[0].id : null);

  let champId: number | null = null;
  for (const candidate of [requestedChamp, envDefaultChamp, latestActiveChamp]) {
    if (Number.isFinite(candidate) && champIdSet.has(candidate as number)) {
      champId = candidate as number;
      break;
    }
  }

  let initial: any[] = [];
  let errorMessage: string | null = null;
  let total = 0;

  // Fetch current user's favorites to mark crowns client-side and filter if needed
  let favoriteIds: number[] = [];
  if (user) {
    const { data: favRows } = await service
      .from("sf_agent_favorites")
      .select("agent_id")
      .eq("user_id", user.id);
    if (Array.isArray(favRows)) favoriteIds = favRows.map((r: any) => r.agent_id);
  }

  // Fetch current page with total count for current view
  {
    if (favoritesOnly && favoriteIds.length === 0) {
      initial = [];
      total = 0;
    } else {
      let scoped = service
        .from("sf_standings")
        .select(
          "id, player_id, games_played, wins, draws, losses, points, bergvizer_score, championship_id",
          { count: "exact" },
        );
      if (champId) scoped = scoped.eq("championship_id", champId);
      if (favoritesOnly) scoped = scoped.in("player_id", favoriteIds);
      if (view === "white") scoped = scoped.gte("player_id", 1001).lte("player_id", 1960);
      if (view === "black") scoped = scoped.gte("player_id", 2001).lte("player_id", 2960);
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
  }

  // Fetch counts for tabs (all/white/black)
  async function countFor(scope: "all" | "white" | "black") {
    if (favoritesOnly && favoriteIds.length === 0) return 0;
    let q = service.from("sf_standings").select("id", { count: "exact", head: true });
    if (champId) q = q.eq("championship_id", champId);
    if (favoritesOnly) q = q.in("player_id", favoriteIds);
    if (scope === "white") q = q.gte("player_id", 1001).lte("player_id", 1960);
    if (scope === "black") q = q.gte("player_id", 2001).lte("player_id", 2960);
    const { count } = await q;
    return typeof count === "number" ? count : 0;
  }

  const [countAll, countWhite, countBlack] = await Promise.all([
    countFor("all"),
    countFor("white"),
    countFor("black"),
  ]);

  let rankMap: Record<number, number> | undefined;
  if (favoritesOnly && favoriteIds.length > 0) {
    let rankScoped = service
      .from("sf_standings")
      .select("player_id, points, bergvizer_score, games_played");
    if (champId) rankScoped = rankScoped.eq("championship_id", champId);
    if (view === "white") rankScoped = rankScoped.gte("player_id", 1001).lte("player_id", 1960);
    if (view === "black") rankScoped = rankScoped.gte("player_id", 2001).lte("player_id", 2960);
    const { data: rankRows } = await rankScoped;
    if (Array.isArray(rankRows)) {
      const cmp = (a: any, b: any) => {
        if (b.points !== a.points) return b.points - a.points;
        const aB = a.bergvizer_score ?? 0;
        const bB = b.bergvizer_score ?? 0;
        if (bB !== aB) return bB - aB;
        if (b.games_played !== a.games_played) return b.games_played - a.games_played;
        return a.player_id - b.player_id;
      };
      rankMap = {};
      rankRows
        .slice()
        .sort(cmp)
        .forEach((row: any, idx: number) => {
          rankMap![row.player_id as number] = idx + 1;
        });
    }
  }

  // Fetch agent display info for current page slice
  let agentsMap: Record<number, AgentRow> = {};
  if (initial.length > 0) {
    const ids = initial.map((r) => r.player_id);
    const { data: agents } = await service
      .from("sf_agents")
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
      {!user ? (
        <div className="alert alert-dark justify-center text-center">
          <span>
            {favoritesLoginPrompt}{" "}
            <a className="link font-semibold" href={`/${lng}/login`}>
              {loginLabel}
            </a>
          </span>
        </div>
      ) : null}
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
        championships={championships}
        agents={agentsMap}
        favoriteIds={favoriteIds}
        favoritesOnly={favoritesOnly}
        showFavoritesToggle={canUseFavorites}
        rankMap={rankMap}
      />
      {errorMessage ? (
        <p className="text-sm text-warning">Unable to fetch standings ({errorMessage}).</p>
      ) : null}
    </div>
  );
}

export async function generateMetadata({ params }: { params: Promise<{ lng: string }> }): Promise<Metadata> {
  const { lng } = await params;
  const currentLng = languages.includes(lng) ? lng : languages[0];
  const { t } = await getServerTranslation(currentLng, "common");
  return { title: t("standings.title", { defaultValue: "Tournament Table" }) as string };
}

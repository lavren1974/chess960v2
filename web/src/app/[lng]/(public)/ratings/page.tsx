import { getServerClient } from "@/lib/supabase/server";
import { getServiceRoleClient } from "@/lib/supabase/service";
import { LiveRatings, type RatingRow } from "@/components/ratings/live-ratings";
import { getServerTranslation } from "@/app/i18n";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { languages } from "@/app/i18n/settings";

export const dynamic = "force-dynamic";

export default async function RatingsPage({
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
    defaultValue: "Sign in to unlock your favorite positions.",
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

  if (
    needsRedirect ||
    (typeof pageRaw === "string" && /perPage=/.test(pageRaw)) ||
    (typeof perPageInput === "string" && /page=/.test(perPageInput))
  ) {
    const q = new URLSearchParams();
    q.set("view", view);
    q.set("page", String(page));
    q.set("perPage", String(perPage));
    if (favoritesOnly) q.set("favorites", "1");
    redirect(`/${lng}/ratings?${q.toString()}`);
  }

  const from = (page - 1) * perPage;
  const to = from + perPage - 1;

  let initial: RatingRow[] = [];
  let errorMessage: string | null = null;
  let total = 0;
  let latestDelta: Record<number, number> = {};
  let rankMap: Record<number, number> | undefined;

  // Fetch current user's favorites to mark crowns on client and filter if needed
  let favoriteIds: number[] = [];
  if (user) {
    const { data: favRows } = await service
      .from("sf_agent_favorites")
      .select("agent_id")
      .eq("user_id", user.id);
    if (Array.isArray(favRows)) favoriteIds = favRows.map((r: any) => r.agent_id);
  }

  // Fetch current page of agents ordered by current_elo desc
  {
    if (favoritesOnly && favoriteIds.length === 0) {
      initial = [];
      total = 0;
    } else {
      let scoped = service
        .from("sf_agents")
        .select("id, sp_id, mini_fen, color, current_elo", { count: "planned" })
        .order("current_elo", { ascending: false })
        .order("color", { ascending: true })
        .order("sp_id", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to);

      if (view === "white") scoped = scoped.eq("color", "w");
      if (view === "black") scoped = scoped.eq("color", "b");
      if (favoritesOnly) scoped = scoped.in("id", favoriteIds);

      const { data, error, count } = await scoped;
      if (Array.isArray(data)) initial = data as unknown as RatingRow[];
      if (typeof count === "number") total = count;
      if (error) errorMessage = error.message;
    }
  }

  // Counts for tabs
  async function countFor(scope: "all" | "white" | "black") {
    if (favoritesOnly && favoriteIds.length === 0) return 0;
    let q = service.from("sf_agents").select("id", { count: "planned", head: true });
    if (scope === "white") q = q.eq("color", "w");
    if (scope === "black") q = q.eq("color", "b");
    if (favoritesOnly) q = q.in("id", favoriteIds);
    const { count } = await q;
    return typeof count === "number" ? count : 0;
  }

  const [countAll, countWhite, countBlack] = await Promise.all([
    countFor("all"),
    countFor("white"),
    countFor("black"),
  ]);

  function cmp(a: Pick<RatingRow, "current_elo" | "color" | "sp_id" | "id">, b: Pick<RatingRow, "current_elo" | "color" | "sp_id" | "id">) {
    if (b.current_elo !== a.current_elo) return b.current_elo - a.current_elo;
    if (a.color !== b.color) return a.color < b.color ? -1 : 1;
    if (a.sp_id !== b.sp_id) return a.sp_id - b.sp_id;
    return a.id - b.id;
  }

  if (favoritesOnly && favoriteIds.length > 0) {
    let rankScoped = service
      .from("sf_agents")
      .select("id, sp_id, color, current_elo")
      .order("current_elo", { ascending: false })
      .order("color", { ascending: true })
      .order("sp_id", { ascending: true })
      .order("id", { ascending: true });
    if (view === "white") rankScoped = rankScoped.eq("color", "w");
    if (view === "black") rankScoped = rankScoped.eq("color", "b");
    const { data: rankRows } = await rankScoped;
    if (Array.isArray(rankRows)) {
      rankMap = {};
      (rankRows as Array<Pick<RatingRow, "current_elo" | "color" | "sp_id" | "id">>)
        .slice()
        .sort(cmp)
        .forEach((row, idx) => {
          rankMap![row.id] = idx + 1;
        });
    }
  }

  // Fetch latest ELO delta for agents on this page.
  // Robust strategy: scan sf_elo_history in created_at DESC order, chunked, until
  // we’ve seen at least one record for each requested player id or a sane cap.
  if (initial.length > 0) {
    const ids = initial.map((a) => a.id);
    const wanted = new Set(ids);
    const seen = new Set<number>();
    const CHUNK = 1000; // rows per request
    const MAX_ROWS = 10000; // hard cap to avoid long scans
    let offset = 0;
    while (seen.size < wanted.size && offset < MAX_ROWS) {
      const { data: hist } = await service
        .from("sf_elo_history")
        .select("player_id, elo_change, created_at")
        .in("player_id", ids)
        .order("created_at", { ascending: false })
        .range(offset, offset + CHUNK - 1);
      const batch = Array.isArray(hist) ? (hist as Array<{ player_id: number; elo_change: number }>) : [];
      if (batch.length === 0) break;
      for (const h of batch) {
        if (wanted.has(h.player_id) && !seen.has(h.player_id)) {
          latestDelta[h.player_id] = h.elo_change;
          seen.add(h.player_id);
          if (seen.size >= wanted.size) break;
        }
      }
      offset += batch.length;
      // If server returned fewer than CHUNK rows, no more data available.
      if (batch.length < CHUNK) break;
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
      <h1 className="text-2xl font-bold">{t("ratings.title")}</h1>
      <LiveRatings
        initial={initial}
        lng={lng}
        perPage={perPage}
        page={page}
        total={total}
        counts={{ all: countAll, white: countWhite, black: countBlack }}
        view={view}
        deltas={latestDelta}
        favoriteIds={favoriteIds}
        favoritesOnly={favoritesOnly}
        showFavoritesToggle={canUseFavorites}
        rankMap={rankMap}
      />
      {errorMessage ? (
        <p className="text-sm text-warning">Unable to fetch ratings ({errorMessage}).</p>
      ) : null}
    </div>
  );
}

export async function generateMetadata({ params }: { params: Promise<{ lng: string }> }): Promise<Metadata> {
  const { lng } = await params;
  const currentLng = languages.includes(lng) ? lng : languages[0];
  const { t } = await getServerTranslation(currentLng, "common");
  return { title: t("ratings.title", { defaultValue: "Ratings" }) as string };
}

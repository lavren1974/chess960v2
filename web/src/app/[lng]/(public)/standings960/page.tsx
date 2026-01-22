import { getServerClient } from "@/lib/supabase/server";
import { getServiceRoleClient } from "@/lib/supabase/service";
import { LiveStandings960 } from "@/components/standings/live-standings-960";
import { getServerTranslation } from "@/app/i18n";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { languages } from "@/app/i18n/settings";
import type { AgentRow } from "@/components/agents/agent-utils";
import {
  combineStandings960,
  sortCombinedStandings,
  type StandingRow,
} from "@/components/standings/standings-960-utils";

export const dynamic = "force-dynamic";

const STANDINGS_SELECT =
  "id, player_id, games_played, wins, draws, losses, points, bergvizer_score, championship_id";

export default async function Standings960Page({
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

  const champRaw = sp.champ ?? sp.championship ?? null;
  const champInput = Array.isArray(champRaw) ? champRaw[0] : champRaw;
  const requestedChamp = parsePositiveInt(champInput, NaN);

  const pageRaw = sp.page ?? "1";
  const pageInput = Array.isArray(pageRaw) ? pageRaw[0] : pageRaw;
  let page = parsePositiveInt(pageInput, 1);

  const favoritesRaw = sp.favorites ?? sp.fav ?? null;
  const favoritesInput = Array.isArray(favoritesRaw) ? favoritesRaw[0] : favoritesRaw;
  const favoritesOnlyRequested =
    typeof favoritesInput === "string" &&
    ["1", "true", "yes", "on"].includes(favoritesInput.toLowerCase());
  const canUseFavorites = Boolean(user);
  const favoritesOnly = canUseFavorites && favoritesOnlyRequested;
  let needsRedirect = false;
  if (favoritesOnlyRequested && !canUseFavorites) needsRedirect = true;

  if (
    needsRedirect ||
    (typeof pageRaw === "string" && /perPage=/.test(pageRaw)) ||
    (typeof perPageInput === "string" && /page=/.test(perPageInput))
  ) {
    const q = new URLSearchParams();
    q.set("page", String(page));
    q.set("perPage", String(perPage));
    if (Number.isFinite(requestedChamp)) q.set("champ", String(requestedChamp));
    if (favoritesOnly) q.set("favorites", "1");
    redirect(`/${lng}/standings960?${q.toString()}`);
  }

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

  let combinedAll: ReturnType<typeof combineStandings960> = [];
  let rankMap: Record<number, number> | undefined;
  let errorMessage: string | null = null;

  // Fetch current user's favorites to mark crowns client-side and filter if needed
  let favoriteIds: number[] = [];
  if (user) {
    const { data: favRows } = await service
      .from("sf_agent_favorites")
      .select("agent_id")
      .eq("user_id", user.id);
    if (Array.isArray(favRows)) favoriteIds = favRows.map((r: any) => r.agent_id);
  }

  const [whiteRes, blackRes] = await Promise.all([
    (() => {
      let q = service.from("sf_standings").select(STANDINGS_SELECT);
      if (champId) q = q.eq("championship_id", champId);
      return q.gte("player_id", 1001).lte("player_id", 1960);
    })(),
    (() => {
      let q = service.from("sf_standings").select(STANDINGS_SELECT);
      if (champId) q = q.eq("championship_id", champId);
      return q.gte("player_id", 2001).lte("player_id", 2960);
    })(),
  ]);

  if (whiteRes.error || blackRes.error) {
    errorMessage = whiteRes.error?.message ?? blackRes.error?.message ?? "Unknown error";
  }

  const rows: StandingRow[] = [];
  if (Array.isArray(whiteRes.data)) rows.push(...(whiteRes.data as StandingRow[]));
  if (Array.isArray(blackRes.data)) rows.push(...(blackRes.data as StandingRow[]));

  const combinedAllFull = sortCombinedStandings(combineStandings960(rows));
  rankMap = {};
  combinedAllFull.forEach((row, idx) => {
    rankMap![row.slot] = idx + 1;
  });
  combinedAll = combinedAllFull;
  if (favoritesOnly && favoriteIds.length === 0) {
    combinedAll = [];
  } else if (favoritesOnly) {
    const favSet = new Set(favoriteIds);
    combinedAll = combinedAll.filter(
      (row) => favSet.has(row.white_id) || favSet.has(row.black_id),
    );
  }

  const total = combinedAll.length;
  const from = (page - 1) * perPage;
  const to = from + perPage;
  const initial = combinedAll.slice(from, to);

  // Fetch agent display info for current page slice
  let agentsMap: Record<number, AgentRow> = {};
  if (initial.length > 0) {
    const ids = Array.from(
      new Set(initial.flatMap((r) => [r.white_id, r.black_id])),
    );
    const { data: agents } = await service
      .from("sf_agents")
      .select("id, sp_id, mini_fen, color")
      .in("id", ids);
    if (Array.isArray(agents)) {
      agentsMap = Object.fromEntries((agents as unknown as AgentRow[]).map((a) => [a.id, a]));
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
      <h1 className="text-2xl font-bold">{`${t("standings.title")} (960)`}</h1>
      <LiveStandings960
        initial={initial}
        champId={champId}
        lng={lng}
        perPage={perPage}
        page={page}
        total={total}
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

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lng: string }>;
}): Promise<Metadata> {
  const { lng } = await params;
  const currentLng = languages.includes(lng) ? lng : languages[0];
  const { t } = await getServerTranslation(currentLng, "common");
  return {
    title: `${t("standings.title", { defaultValue: "Tournament Table" }) as string} (960)`,
  };
}

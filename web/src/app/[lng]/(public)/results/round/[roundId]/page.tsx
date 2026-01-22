import { getServerClient } from "@/lib/supabase/server";
import { getServiceRoleClient } from "@/lib/supabase/service";
import { RoundResultsLive, type RoundMatchRow } from "@/components/results/round-results-live";
import { getServerTranslation } from "@/app/i18n";
import type { AgentRow } from "@/components/agents/agent-utils";
import type { Metadata } from "next";
import { languages } from "@/app/i18n/settings";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[]>;

export default async function RoundResultsPage({
  params,
  searchParams,
}: {
  params: Promise<{ lng: string; roundId: string }>;
  searchParams?: Promise<SearchParams>;
}) {
  const { lng, roundId } = await params;
  const sp = (searchParams ? await searchParams : {}) as SearchParams;
  const { t } = await getServerTranslation(lng, "common");
  const favoritesLoginPrompt = t("standings.favoritesLoginPrompt", {
    defaultValue: "Sign in to unlock your favorite positions.",
  });
  const loginLabel = t("nav.login", { defaultValue: "Login" });
  const id = Number(roundId);
  const champRaw = sp.champ ?? sp.championship ?? null;
  const champInput = Array.isArray(champRaw) ? champRaw[0] : champRaw;

  function parsePositiveInt(v: unknown, fallback: number): number {
    const n = typeof v === "string" ? parseInt(v, 10) : NaN;
    return Number.isFinite(n) && n > 0 ? n : fallback;
  }

  if (!Number.isFinite(id)) {
    return <div className="text-error">Invalid round id</div>;
  }

  const supabase = getServiceRoleClient();
  const auth = await getServerClient();
  const { data: userData } = await auth.auth.getUser();
  const user = userData.user;
  const scope = (Array.isArray(sp.scope) ? sp.scope[0] : sp.scope) === "all" ? "all" : "latest";
  const pageSizeDefault = scope === "all" ? 200 : 50;
  const perPageRaw = sp.perPage ?? String(pageSizeDefault);
  const perPageInput = Array.isArray(perPageRaw) ? perPageRaw[0] : perPageRaw;
  const perPageCandidate = Number.parseInt(perPageInput, 10);
  const perPage = Number.isFinite(perPageCandidate) && perPageCandidate > 0 ? perPageCandidate : pageSizeDefault;

  const pageRaw = sp.page ?? "1";
  const pageInput = Array.isArray(pageRaw) ? pageRaw[0] : pageRaw;
  const pageCandidate = Number.parseInt(pageInput, 10);
  const page = Number.isFinite(pageCandidate) && pageCandidate > 0 ? pageCandidate : 1;

  const requestedChamp = parsePositiveInt(champInput, NaN);
  const envDefaultChamp = parsePositiveInt(process.env.DEFAULT_CHAMPIONSHIP_ID, NaN);

  const from = (page - 1) * perPage;
  const to = from + perPage - 1;

  const { data: champs } = await supabase
    .from("sf_championships")
    .select("id, status, start_date")
    .order("start_date", { ascending: false });
  const championships = Array.isArray(champs) ? champs : [];
  const champIdSet = new Set(championships.map((c) => c.id));
  const latestActiveChamp =
    championships.find((c) => c.status === "active")?.id ?? (championships[0]?.id ?? null);
  let champId: number | null = null;
  for (const candidate of [requestedChamp, envDefaultChamp, latestActiveChamp]) {
    if (Number.isFinite(candidate) && champIdSet.has(candidate as number)) {
      champId = candidate as number;
      break;
    }
  }

  const favoritesRaw = sp.favorites ?? sp.fav ?? null;
  const favoritesInput = Array.isArray(favoritesRaw) ? favoritesRaw[0] : favoritesRaw;
  const favoritesOnlyRequested =
    typeof favoritesInput === "string" &&
    ["1", "true", "yes", "on"].includes(favoritesInput.toLowerCase());
  const canUseFavorites = Boolean(user);
  const favoritesOnly = canUseFavorites && favoritesOnlyRequested;
  if (favoritesOnlyRequested && !canUseFavorites) {
    const q = new URLSearchParams();
    if (scope === "all") q.set("scope", "all");
    if (champId) q.set("champ", String(champId));
    if (page > 1) q.set("page", String(page));
    if (perPage !== pageSizeDefault) q.set("perPage", String(perPage));
    redirect(`/${lng}/results/round/${id}${q.toString() ? `?${q.toString()}` : ""}`);
  }

  // Fetch current user's favorites (ids) to mark crowns client-side and filter if needed
  let favoriteIds: number[] = [];
  if (user) {
    const { data: favRows } = await supabase
      .from("sf_agent_favorites")
      .select("agent_id")
      .eq("user_id", user.id);
    if (Array.isArray(favRows)) favoriteIds = favRows.map((r: any) => r.agent_id);
  }

  let matchQuery = supabase
    .from("sf_matches")
    .select("id, created_at, player_white, player_black, round, championship_id, result", { count: "exact" })
    .eq("status", true)
    .not("result", "is", null)
    .eq("round", id);
  if (champId) matchQuery = matchQuery.eq("championship_id", champId);
  if (favoritesOnly && favoriteIds.length > 0) {
    const ids = favoriteIds.join(",");
    matchQuery = matchQuery.or(`player_white.in.(${ids}),player_black.in.(${ids})`);
  }
  if (favoritesOnly && favoriteIds.length === 0) {
    const empty: RoundMatchRow[] = [];
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
        <h1 className="text-2xl font-bold">{t("results.roundTitle", { id })}</h1>

        <RoundResultsLive
          initial={empty}
          roundId={id}
          lng={lng}
          perPage={perPage}
          page={page}
          total={0}
          agents={{}}
          scope={scope}
          champId={champId}
          championships={championships}
          favoriteIds={favoriteIds}
          favoritesOnly={favoritesOnly}
          showFavoritesToggle={canUseFavorites}
        />
      </div>
    );
  }
  const { data, error, count } = await matchQuery.order("id", { ascending: false }).range(from, to);

  const initial: RoundMatchRow[] = Array.isArray(data) ? (data as unknown as RoundMatchRow[]) : [];
  const total = typeof count === "number" && count > 0 ? count : from + initial.length;

  // Fetch agents for current slice
  let agentsMap: Record<number, AgentRow> = {};
  if (initial.length > 0) {
    const idSet = new Set<number>();
    for (const m of initial) {
      idSet.add(m.player_white);
      idSet.add(m.player_black);
    }
    const ids = Array.from(idSet);
    const { data: agents } = await supabase
      .from("sf_agents")
      .select("id, sp_id, mini_fen, color")
      .in("id", ids);
    if (Array.isArray(agents)) {
      agentsMap = Object.fromEntries((agents as unknown as AgentRow[]).map((a) => [a.id, a]));
    }
  }

  function linkFor(nextScope: "latest" | "all") {
    const q = new URLSearchParams();
    if (nextScope === "all") q.set("scope", "all");
    if (champId) q.set("champ", String(champId));
    if (favoritesOnly) q.set("favorites", "1");
    return `/${lng}/results/round/${id}${q.toString() ? `?${q.toString()}` : ""}`;
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
      <h1 className="text-2xl font-bold">{t("results.roundTitle", { id })}</h1>

      <RoundResultsLive
        initial={initial}
        roundId={id}
        lng={lng}
        perPage={perPage}
        page={page}
        total={total}
        agents={agentsMap}
        scope={scope}
        champId={champId}
        championships={championships}
        favoriteIds={favoriteIds}
        favoritesOnly={favoritesOnly}
        showFavoritesToggle={canUseFavorites}
      />
      {error ? (
        <p className="text-sm text-warning">Unable to fetch initial results ({error.message}).</p>
      ) : null}
    </div>
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lng: string; roundId: string }>;
}): Promise<Metadata> {
  const { lng, roundId } = await params;
  const currentLng = languages.includes(lng) ? lng : languages[0];
  const { t } = await getServerTranslation(currentLng, "common");
  const id = Number(roundId);
  const title = Number.isFinite(id)
    ? t("results.roundTitle", { id, defaultValue: `Round ${roundId} Results` })
    : t("results.roundTitle", { id: roundId, defaultValue: "Round Results" });
  return {
    title: title as string,
  };
}

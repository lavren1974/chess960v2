import { getServerClient } from "@/lib/supabase/server";
import { getServiceRoleClient } from "@/lib/supabase/service";
import { getServerTranslation } from "@/app/i18n";
import { AllResultsLive } from "@/components/results/all-results-live";
import type { MatchRow } from "@/components/results/live-results";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { languages } from "@/app/i18n/settings";
import type { AgentRow } from "@/components/agents/agent-utils";

type SearchParams = Record<string, string | string[]>;

// Server-side pagination controls. `ALLOWED_PAGE_SIZES` caps how many rows the
// client is allowed to request per page.
const DEFAULT_PAGE_SIZE = 50;
const ALLOWED_PAGE_SIZES = [50, 100, 1000] as const;

export const dynamic = "force-dynamic";

// Parse a strictly positive integer or return a fallback.
function parsePositiveInt(v: unknown, fallback: number): number {
  const n = typeof v === "string" ? parseInt(v, 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export default async function AllResultsPage(props: {
  params: Promise<{ lng: string }>;
  searchParams?: Promise<SearchParams>;
}) {
  const { lng } = await props.params;
  const { t } = await getServerTranslation(lng, "common");
  const sp = (props.searchParams ? await props.searchParams : {}) as SearchParams;
  const supabase = await getServerClient();
  const favoritesLoginPrompt = t("standings.favoritesLoginPrompt", {
    defaultValue: "Sign in to unlock your favorite positions.",
  });
  const loginLabel = t("nav.login", { defaultValue: "Login" });
  const champRaw = sp.champ ?? sp.championship ?? null;
  const champInput = Array.isArray(champRaw) ? champRaw[0] : champRaw;
  const requestedChamp = parsePositiveInt(champInput, NaN);

  // Normalize `perPage` accepting malformed concatenations like `page=1perPage=100`.
  const pageSizeRaw = sp.perPage ?? String(DEFAULT_PAGE_SIZE);
  const perPageInput = Array.isArray(pageSizeRaw) ? pageSizeRaw[0] : pageSizeRaw;
  const perPageFromConcat = typeof perPageInput === "string" ? /perPage=(\d+)/i.exec(perPageInput)?.[1] : undefined;
  const pageRawForPer = sp.page ?? "";
  const pageInputForPer = Array.isArray(pageRawForPer) ? pageRawForPer[0] : pageRawForPer;
  const perPageFromPageRaw = typeof pageInputForPer === "string" ? /perPage=(\d+)/i.exec(pageInputForPer)?.[1] : undefined;
  let needsRedirect = false;
  const perPageCandidate = parsePositiveInt(
    perPageFromConcat ?? perPageFromPageRaw ?? perPageInput,
    DEFAULT_PAGE_SIZE,
  );
  const perPage = (ALLOWED_PAGE_SIZES as readonly number[]).includes(perPageCandidate)
    ? perPageCandidate
    : DEFAULT_PAGE_SIZE;

  // Normalize `page` accepting similar malformed concatenations.
  const pageRaw = sp.page ?? "1";
  const pageInput = Array.isArray(pageRaw) ? pageRaw[0] : pageRaw;
  // Extract page from messy inputs without matching `perPage=` erroneously
  const pageMatch =
    typeof pageInput === "string" ? /(^|[^a-zA-Z])page=(\d+)/i.exec(pageInput) : null;
  const pageFromConcat = pageMatch?.[2];
  // If someone passed `perPage=50page=2`, pull page from perPageRaw too (with safe boundary)
  const pageMatchFromPer =
    typeof perPageInput === "string" ? /(^|[^a-zA-Z])page=(\d+)/i.exec(perPageInput) : null;
  const pageFromPerRaw = pageMatchFromPer?.[2];
  const page = Math.max(1, parsePositiveInt(pageFromConcat ?? pageFromPerRaw ?? pageInput, 1));
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  const favoritesRaw = sp.favorites ?? sp.fav ?? null;
  const favoritesInput = Array.isArray(favoritesRaw) ? favoritesRaw[0] : favoritesRaw;
  const favoritesOnlyRequested =
    typeof favoritesInput === "string" &&
    ["1", "true", "yes", "on"].includes(favoritesInput.toLowerCase());
  const canUseFavorites = Boolean(user);
  const favoritesOnly = canUseFavorites && favoritesOnlyRequested;
  if (favoritesOnlyRequested && !canUseFavorites) needsRedirect = true;
  if (
    (typeof pageInput === "string" && ((/perPage=/.test(pageInput)) || ((/page=/.test(pageInput)) && pageInput !== String(page)))) ||
    (typeof perPageInput === "string" && ((/page=/.test(perPageInput)) || ((/perPage=/.test(perPageInput)) && perPageInput !== String(perPage))))
  ) {
    needsRedirect = true;
  }

  if (needsRedirect) {
    const q = new URLSearchParams();
    q.set("page", String(page));
    q.set("perPage", String(perPage));
    if (Number.isFinite(requestedChamp)) q.set("champ", String(requestedChamp));
    if (favoritesOnly) q.set("favorites", "1");
    redirect(`/${lng}/results/all?${q.toString()}`);
  }

  const from = (page - 1) * perPage;
  const to = from + perPage - 1;

  const db = getServiceRoleClient();
  const envDefaultChamp = parsePositiveInt(process.env.DEFAULT_CHAMPIONSHIP_ID, NaN);

  const { data: champs } = await db
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

  // Fetch current user's favorites (ids) to mark crowns client-side and filter if needed
  let favoriteIds: number[] = [];
  if (user) {
    const { data: favRows } = await db
      .from("sf_agent_favorites")
      .select("agent_id")
      .eq("user_id", user.id);
    if (Array.isArray(favRows)) favoriteIds = favRows.map((r: any) => r.agent_id);
  }

  const favoritesFilter = favoritesOnly && favoriteIds.length > 0 ? favoriteIds : null;

  // Some PostgREST deployments cap a single response to 50 rows.
  // Fetch in chunks until we reach the desired perPage, preserving order.
  async function fetchChunk(start: number, end: number, withCount = false) {
    let sel = db
      .from("sf_matches")
      .select(
        "id, created_at, player_white, player_black, round, championship_id, result",
        withCount ? { count: "planned" } : {},
      )
      .eq("status", true)
      .not("result", "is", null)
      .order("id", { ascending: false })
      .range(start, end);
    if (champId) sel = sel.eq("championship_id", champId);
    if (favoritesFilter) {
      const ids = favoritesFilter.join(",");
      sel = sel.or(`player_white.in.(${ids}),player_black.in.(${ids})`);
    }
    return sel;
  }

  let initial: MatchRow[] = [];
  let hasExtra = false;
  let hasNext = false;
  let error: { message: string } | null = null;

  if (favoritesOnly && favoriteIds.length === 0) {
    initial = [];
    hasNext = false;
  } else {
    // First attempt: request the full window in one go
    {
      // Fetch one extra row to detect if another page exists when counts are missing.
      const { data, error: e } = await fetchChunk(from, to + 1, false);
      if (e) error = e as { message: string };
      if (Array.isArray(data)) {
        hasExtra = data.length > perPage;
        initial = hasExtra ? (data as unknown as MatchRow[]).slice(0, perPage) : (data as unknown as MatchRow[]);
      }
    }

    // If server limited the rows (e.g., 50), fetch remaining rows in subsequent chunked requests.
    if (initial.length < perPage) {
      const observedChunk = initial.length > 0 ? initial.length : 50;
      let nextFrom = from + initial.length;
      const target = perPage;
      while (initial.length < target) {
        const nextTo = nextFrom + observedChunk - 1;
        const { data, error: e2 } = await fetchChunk(nextFrom, nextTo, false);
        if (e2 && !error) error = e2 as { message: string };
        const batch = Array.isArray(data) ? (data as unknown as MatchRow[]) : [];
        if (batch.length === 0) break;
        initial = initial.concat(batch);
        nextFrom += batch.length;
        // Guard against unexpected server behavior
        if (batch.length < observedChunk) break;
      }
    }

    // Determine if a next page exists without an expensive count query.
    if (hasExtra) {
      hasNext = true;
    } else if (initial.length >= perPage) {
      const { data: nextPage } = await fetchChunk(to + 1, to + 1, false);
      hasNext = Array.isArray(nextPage) && nextPage.length > 0;
    }
  }

  // Fetch agents for current slice (chunked to avoid URL length limits).
  const agentsMap: Record<number, AgentRow> = {};
  if (initial.length > 0) {
    const idSet = new Set<number>();
    for (const m of initial) {
      idSet.add(m.player_white);
      idSet.add(m.player_black);
    }
    const ids = Array.from(idSet);
    const CHUNK = 200;
    for (let i = 0; i < ids.length; i += CHUNK) {
      const slice = ids.slice(i, i + CHUNK);
      const { data: agents } = await db
        .from("sf_agents")
        .select("id, sp_id, mini_fen, color")
        .in("id", slice);
      if (Array.isArray(agents)) {
        for (const a of agents as unknown as AgentRow[]) {
          agentsMap[a.id] = a;
        }
      }
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
      <h1 className="text-2xl font-bold">{t("results.allTitle")}</h1>
      <AllResultsLive
        initial={initial}
        lng={lng}
        perPage={perPage}
        page={page}
        hasNext={hasNext}
        agents={agentsMap}
        favoriteIds={favoriteIds}
        champId={champId}
        championships={championships}
        favoritesOnly={favoritesOnly}
        showFavoritesToggle={canUseFavorites}
      />
      {error ? (
        <p className="text-sm text-warning">
          Unable to fetch results ({error.message}). Check RLS and permissions.
        </p>
      ) : null}
    </div>
  );
}

export async function generateMetadata({ params }: { params: Promise<{ lng: string }> }): Promise<Metadata> {
  const { lng } = await params;
  const currentLng = languages.includes(lng) ? lng : languages[0];
  const { t } = await getServerTranslation(currentLng, "common");
  return { title: t("results.allTitle", { defaultValue: "All Results" }) as string };
}

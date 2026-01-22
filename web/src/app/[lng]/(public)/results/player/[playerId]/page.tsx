import { getServiceRoleClient } from "@/lib/supabase/service";
import { PlayerResultsLive, type PlayerMatchRow } from "@/components/results/player-results-live";
import { getServerTranslation } from "@/app/i18n";
import type { AgentRow } from "@/components/agents/agent-utils";
import { AgentLabel } from "@/components/agents/agent-label";
import type { Metadata } from "next";
import { languages } from "@/app/i18n/settings";

export const dynamic = "force-dynamic";

export default async function PlayerResultsPage({
  params,
  searchParams,
}: {
  params: Promise<{ lng: string; playerId: string }>;
  searchParams?: Promise<Record<string, string | string[]>>;
}) {
  const { lng, playerId } = await params;
  const sp = (searchParams ? await searchParams : {}) as Record<string, string | string[]>;
  const { t } = await getServerTranslation(lng, "common");
  const id = Number(playerId);
  const champRaw = sp.champ ?? sp.championship ?? null;
  const champInput = Array.isArray(champRaw) ? champRaw[0] : champRaw;

  if (!Number.isFinite(id)) {
    return <div className="text-error">Invalid player id</div>;
  }

  function parsePositiveInt(v: unknown, fallback: number): number {
    const n = typeof v === "string" ? parseInt(v, 10) : NaN;
    return Number.isFinite(n) && n > 0 ? n : fallback;
  }

  const perPageDefault = 30;
  const perPageRaw = sp.perPage ?? String(perPageDefault);
  const perPageInput = Array.isArray(perPageRaw) ? perPageRaw[0] : perPageRaw;
  const perPage = parsePositiveInt(perPageInput, perPageDefault);

  const pageRaw = sp.page ?? "1";
  const pageInput = Array.isArray(pageRaw) ? pageRaw[0] : pageRaw;
  const page = parsePositiveInt(pageInput, 1);
  const requestedChamp = parsePositiveInt(champInput, NaN);
  const envDefaultChamp = parsePositiveInt(process.env.DEFAULT_CHAMPIONSHIP_ID, NaN);

  const from = (page - 1) * perPage;
  const to = from + perPage - 1;

  const supabase = getServiceRoleClient();
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

  let total = 0;
  let matchQuery = supabase
    .from("sf_matches")
    .select("id, created_at, player_white, player_black, round, championship_id, result", { count: "exact" })
    .eq("status", true)
    .not("result", "is", null)
    .or(`player_white.eq.${id},player_black.eq.${id}`);
  if (champId) matchQuery = matchQuery.eq("championship_id", champId);
  const { data, error, count } = await matchQuery.order("id", { ascending: false }).range(from, to);

  const initial: PlayerMatchRow[] = Array.isArray(data) ? (data as unknown as PlayerMatchRow[]) : [];
  if (typeof count === "number") total = count;

  // Fetch agents (both sides from initial rows) plus the requested player id
  let agentsMap: Record<number, AgentRow> = {};
  {
    const idSet = new Set<number>([id]);
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

  // Fetch current ELO for this player
  let currentElo: number | null = null;
  {
    const { data: eloRow } = await supabase
      .from("sf_agents")
      .select("current_elo")
      .eq("id", id)
      .maybeSingle();
    if (eloRow && typeof (eloRow as any).current_elo === "number") {
      currentElo = (eloRow as any).current_elo as number;
    }
  }

  const displayName = agentsMap[id] ? `${agentsMap[id].color}-${agentsMap[id].sp_id}` : String(id);
  const titleTemplate = t("results.playerTitle", { name: "__NAME__" });
  const [titleBefore, titleAfter] = titleTemplate.split("__NAME__");

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">
        {titleBefore}
        {agentsMap[id] ? <span className="mx-1 inline-block align-middle"><AgentLabel agent={agentsMap[id]} /></span> : displayName}
        {titleAfter}
      </h1>
      {currentElo != null ? (
        <div className="text-sm opacity-80">
          {t("results.currentElo")}: <span className="badge badge-success badge-sm align-middle">{currentElo}</span>
        </div>
      ) : null}
      <PlayerResultsLive
        initial={initial}
        playerId={id}
        lng={lng}
        agents={agentsMap}
        perPage={perPage}
        page={page}
        total={total}
        champId={champId}
        championships={championships}
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
  params: Promise<{ lng: string; playerId: string }>;
}): Promise<Metadata> {
  const { lng, playerId } = await params;
  const currentLng = languages.includes(lng) ? lng : languages[0];
  const { t } = await getServerTranslation(currentLng, "common");
  const title = t("results.playerTitle", { name: playerId, defaultValue: `Player ${playerId} Results` }) as string;
  return {
    title,
  };
}

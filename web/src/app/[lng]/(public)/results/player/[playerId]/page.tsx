import { getServerClient } from "@/lib/supabase/server";
import { PlayerResultsLive, type PlayerMatchRow } from "@/components/results/player-results-live";
import { getServerTranslation } from "@/app/i18n";
import type { AgentRow } from "@/components/agents/agent-utils";
import { AgentLabel } from "@/components/agents/agent-label";

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

  const from = (page - 1) * perPage;
  const to = from + perPage - 1;

  const supabase = await getServerClient();
  let total = 0;
  const { data, error, count } = await supabase
    .from("matches")
    .select("id, created_at, player_white, player_black, round, championship_id, result", { count: "planned" })
    .eq("status", true)
    .not("result", "is", null)
    .or(`player_white.eq.${id},player_black.eq.${id}`)
    .order("id", { ascending: false })
    .range(from, to);

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
      .from("agents")
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
      .from("agents")
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
      />
      {error ? (
        <p className="text-sm text-warning">Unable to fetch initial results ({error.message}).</p>
      ) : null}
    </div>
  );
}

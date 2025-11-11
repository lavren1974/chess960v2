import { getServerClient } from "@/lib/supabase/server";
import { RoundResultsLive, type RoundMatchRow } from "@/components/results/round-results-live";
import { getServerTranslation } from "@/app/i18n";
import { RoundJump } from "@/components/results/round-jump";
import type { AgentRow } from "@/components/agents/agent-utils";
import type { Metadata } from "next";

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
  const id = Number(roundId);

  if (!Number.isFinite(id)) {
    return <div className="text-error">Invalid round id</div>;
  }

  const supabase = await getServerClient();
  const scope = (Array.isArray(sp.scope) ? sp.scope[0] : sp.scope) === "all" ? "all" : "latest";
  const limit = scope === "all" ? 960 : 50;

  const { data, error } = await supabase
    .from("matches")
    .select("id, created_at, player_white, player_black, round, championship_id, result")
    .eq("status", true)
    .not("result", "is", null)
    .eq("round", id)
    .order("id", { ascending: false })
    .limit(limit);

  const initial: RoundMatchRow[] = Array.isArray(data) ? (data as unknown as RoundMatchRow[]) : [];

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
      .from("agents")
      .select("id, sp_id, mini_fen, color")
      .in("id", ids);
    if (Array.isArray(agents)) {
      agentsMap = Object.fromEntries((agents as unknown as AgentRow[]).map((a) => [a.id, a]));
    }
  }

  function linkFor(nextScope: "latest" | "all") {
    const q = new URLSearchParams();
    if (nextScope === "all") q.set("scope", "all");
    return `/${lng}/results/round/${id}${q.toString() ? `?${q.toString()}` : ""}`;
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t("results.roundTitle", { id })}</h1>

      <RoundJump lng={lng} scope={scope} />

      <div className="flex items-center gap-2 text-sm">
        <span>{t("results.scopeLabel")}</span>
        <a
          href={linkFor("latest")}
          className={`btn btn-xs ${scope === "latest" ? "btn-primary" : "btn-ghost"}`}
        >
          {t("results.scopeLatest")}
        </a>
        <a href={linkFor("all")} className={`btn btn-xs ${scope === "all" ? "btn-primary" : "btn-ghost"}`}>
          {t("results.scopeAll")}
        </a>
      </div>

      <RoundResultsLive initial={initial} roundId={id} lng={lng} maxRows={limit} agents={agentsMap} />
      {error ? (
        <p className="text-sm text-warning">Unable to fetch initial results ({error.message}).</p>
      ) : null}
    </div>
  );
}

export async function generateMetadata({ params }: { params: Promise<{ lng: string; roundId: string }> }): Promise<Metadata> {
  const { lng, roundId } = await params;
  const id = Number(roundId);
  const { t } = await getServerTranslation(lng, "common");
  const title = Number.isFinite(id) ? t("results.roundTitle", { id }) : t("results.roundTitle", { id: "-" });
  return { title };
}

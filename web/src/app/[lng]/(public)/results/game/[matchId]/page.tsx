import { getServiceRoleClient } from "@/lib/supabase/service";
import { getServerTranslation } from "@/app/i18n";
import { PgnViewer } from "@/components/pgn/pgn-viewer";
import { BackButton } from "@/components/ui/back-button";
import type { AgentRow } from "@/components/agents/agent-utils";
import { AgentLabel } from "@/components/agents/agent-label";
import type { Metadata } from "next";
import { languages } from "@/app/i18n/settings";

// Dynamic route: render on demand so PGN/agents are always fresh.
export const dynamic = "force-dynamic";

// Agent labels are rendered via <AgentLabel>, showing mini-FEN images + color/id.

export default async function GamePage({
  params,
}: {
  params: Promise<{ lng: string; matchId: string }>;
}) {
  const { lng, matchId } = await params;
  const { t } = await getServerTranslation(lng, "common");
  const id = Number(matchId);

  if (!Number.isFinite(id)) {
    return <div className="text-error">Invalid match id</div>;
  }

  const supabase = getServiceRoleClient();
  const { data, error } = await supabase
    .from("sf_matches")
    .select("id, pgn, player_white, player_black, result, round")
    .eq("id", id)
    .limit(1)
    .maybeSingle();

  if (error) {
    return <div className="text-error">Failed to load game: {error.message}</div>;
  }

  let aWhite: AgentRow | undefined;
  let aBlack: AgentRow | undefined;
  if (data?.player_white != null && data?.player_black != null) {
    const { data: agents } = await supabase
      .from("sf_agents")
      .select("id, sp_id, mini_fen, color")
      .in("id", [data.player_white, data.player_black]);
    if (Array.isArray(agents)) {
      for (const a of agents as unknown as AgentRow[]) {
        if (a.id === data.player_white) aWhite = a;
        if (a.id === data.player_black) aBlack = a;
      }
    }
  }

  function splitScores(result: string | null | undefined): [string, string] {
    const r = (result || "").trim();
    if (r === "1-0") return ["1", "0"]; 
    if (r === "0-1") return ["0", "1"]; 
    if (r === "1/2-1/2" || r === "½-½") return ["1/2", "1/2"]; 
    return ["-", "-"]; 
  }
  const [wScore, bScore] = splitScores((data as any)?.result);

  const HeaderBlock = (
    <div className="space-y-3">
      <h1 className="text-2xl font-bold text-center">Game {id}</h1>
      <div className="inline-block mx-auto">
        <table className="table table-compact">
          <tbody>
            <tr>
              <td className="pr-3 text-center text-lg">
                {aWhite ? (
                  <a href={`/${lng}/results/player/${aWhite.id}`} className="inline-block align-middle transform scale-110">
                    <AgentLabel agent={aWhite} />
                  </a>
                ) : (
                  <span className="badge badge-ghost">-</span>
                )}
              </td>
              <td className="font-semibold text-center align-middle">{wScore}</td>
            </tr>
            <tr>
              <td className="pr-3 text-center text-lg">
                {aBlack ? (
                  <a href={`/${lng}/results/player/${aBlack.id}`} className="inline-block align-middle transform scale-110">
                    <AgentLabel agent={aBlack} />
                  </a>
                ) : (
                  <span className="badge badge-ghost">-</span>
                )}
              </td>
              <td className="font-semibold text-center align-middle">{bScore}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div className="flex justify-center">
        <a className="btn btn-sm" href={`/${lng}/results/all`}>
          {t("nav.allResults")}
        </a>
      </div>
    </div>
  );

  if (!data || !data.pgn) {
    return (
      <div className="space-y-6">
        <div className="flex">
          <BackButton fallbackHref={`/${lng}/results/all`}>← Back</BackButton>
        </div>
        {HeaderBlock}
        <p className="text-warning text-center">No PGN available for this match yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex">
        <BackButton fallbackHref={`/${lng}/results/all`}>← Back</BackButton>
      </div>
      <PgnViewer pgn={data.pgn} asideTop={HeaderBlock} />
    </div>
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lng: string; matchId: string }>;
}): Promise<Metadata> {
  const { lng, matchId } = await params;
  const currentLng = languages.includes(lng) ? lng : languages[0];
  const { t } = await getServerTranslation(currentLng, "common");
  const gameLabel = t("results.headers.game", { defaultValue: "Game" }) as string;
  return {
    title: `${gameLabel} ${matchId}`,
  };
}


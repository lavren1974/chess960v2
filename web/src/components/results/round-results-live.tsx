"use client";

// Round Results (client): shows live-updating results for a single round.
// Matches are filtered by round id and updated in place from realtime events.
// Agent labels are fetched on-demand to avoid showing numeric IDs.

import { useEffect, useMemo, useRef, useState } from "react";
import { useSupabase } from "@/components/supabase-provider";
import { useTranslation } from "react-i18next";
import type { AgentRow } from "@/components/agents/agent-utils";
import { AgentLabel } from "@/components/agents/agent-label";

export type RoundMatchRow = {
  id: number;
  created_at: string;
  player_white: number;
  player_black: number;
  round: number | null;
  championship_id: number;
  result: string | null;
};

function isFinished(row: RoundMatchRow) {
  return Boolean(row.result);
}

export function RoundResultsLive({
  initial,
  roundId,
  lng,
  maxRows,
  agents,
}: {
  initial: RoundMatchRow[];
  roundId: number;
  lng: string;
  maxRows: number;
  agents: Record<number, AgentRow>;
}) {
  const { client } = useSupabase();
  const [items, setItems] = useState<RoundMatchRow[]>(initial);
  // Local cache for agent metadata so labels render promptly when available.
  const [agentMap, setAgentMap] = useState<Record<number, AgentRow>>(agents);
  const agentMapRef = useRef<Record<number, AgentRow>>(agents);
  const seenIds = useRef<Set<number>>(new Set(initial.map((r) => r.id)));
  const { t } = useTranslation();

  // Keep local agent map in sync
  useEffect(() => {
    setAgentMap(agents);
    agentMapRef.current = agents;
  }, [agents]);

  // Subscribe to realtime INSERT/UPDATE for matches and keep only those that
  // belong to the selected round. Maintain at most `maxRows` entries.
  useEffect(() => {
    const channel = client
      .channel(`realtime-round-${roundId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "matches" }, (payload) => {
        const row = payload.new as RoundMatchRow;
        if (!row || !isFinished(row)) return;
        if (row.round !== roundId) return;
        if (seenIds.current.has(row.id)) return;
        seenIds.current.add(row.id);
        setItems((prev) => [row, ...prev].slice(0, maxRows));
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "matches" }, (payload) => {
        const row = payload.new as RoundMatchRow;
        if (!row || !isFinished(row)) return;
        if (row.round !== roundId) return;
        setItems((prev) => {
          const idx = prev.findIndex((r) => r.id === row.id);
          if (idx >= 0) {
            const next = prev.slice();
            next[idx] = row;
            return next;
          }
          if (!seenIds.current.has(row.id)) {
            seenIds.current.add(row.id);
            return [row, ...prev].slice(0, maxRows);
          }
          return prev;
        });
      })
      .subscribe();

    return () => {
      void client.removeChannel(channel);
    };
  }, [client, roundId, maxRows]);

  const rows = useMemo(() => items, [items]);

  // Backfill missing agents for rows in view to avoid showing IDs
  useEffect(() => {
    const missing = new Set<number>();
    for (const m of items) {
      if (!agentMapRef.current[m.player_white]) missing.add(m.player_white);
      if (!agentMapRef.current[m.player_black]) missing.add(m.player_black);
    }
    if (missing.size === 0) return;
    const ids = Array.from(missing);
    const CHUNK = 200;
    let cancelled = false;
    (async () => {
      for (let i = 0; i < ids.length && !cancelled; i += CHUNK) {
        const slice = ids.slice(i, i + CHUNK);
        const { data } = await client
          .from("agents")
          .select("id, sp_id, mini_fen, color")
          .in("id", slice);
        if (Array.isArray(data) && !cancelled) {
          setAgentMap((prev) => {
            const next = { ...prev };
            for (const a of data as unknown as AgentRow[]) next[a.id] = a;
            agentMapRef.current = next;
            return next;
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [items, client]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">{t("results.roundTitle", { id: roundId })}</h2>
        <span className="text-sm opacity-70">{t("results.countShown", { count: rows.length })}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="table table-zebra w-full text-center min-w-max">
          <thead>
            <tr>
              <th className="text-center">{t("results.headers.white")}</th>
              <th className="text-center">{t("results.headers.black")}</th>
              <th className="text-center">{t("results.headers.round")}</th>
              <th className="text-center">{t("results.headers.result")}</th>
              <th className="text-center">{t("results.headers.game")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => (
              <tr key={m.id}>
                <td className="text-center">
                  <a className="link link-primary" href={`/${lng}/results/player/${m.player_white}`}>
                    {agentMap[m.player_white] ? (
                      <AgentLabel agent={agentMap[m.player_white]} />
                    ) : (
                      <span className="opacity-60">…</span>
                    )}
                  </a>
                </td>
                <td className="text-center">
                  <a className="link link-primary" href={`/${lng}/results/player/${m.player_black}`}>
                    {agentMap[m.player_black] ? (
                      <AgentLabel agent={agentMap[m.player_black]} />
                    ) : (
                      <span className="opacity-60">…</span>
                    )}
                  </a>
                </td>
                <td className="text-center">
                  <a className="link link-primary" href={`/${lng}/results/round/${m.round ?? ""}`}>
                    {m.round ?? "-"}
                  </a>
                </td>
                <td className="text-center font-medium">{m.result}</td>
                <td className="text-center">
                  <a className="link link-primary" href={`/${lng}/results/game/${m.id}`}>
                    {t("viewer.pgn")} #{m.id}
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

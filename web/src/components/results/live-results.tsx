"use client";

// Latest Results (client-only widget): shows a short list of recent finished
// matches with live updates. Used on the legacy `/results` page prior to
// redirect changes; kept here for potential reuse in other sections.

import { useEffect, useMemo, useRef, useState } from "react";
import type { RealtimePostgresInsertPayload, RealtimePostgresUpdatePayload } from "@supabase/supabase-js";
import { useSupabase } from "@/components/supabase-provider";
import { useTranslation } from "react-i18next";
import type { AgentRow } from "@/components/agents/agent-utils";
import { AgentLabel } from "@/components/agents/agent-label";

export type MatchRow = {
  id: number;
  created_at: string;
  player_white: number;
  player_black: number;
  round: number | null;
  championship_id: number;
  result: string | null;
  status?: boolean | null;
};

function isFinished(row: MatchRow) {
  return Boolean(row.result) && row.status !== false; // server limits to status=true, guard for client updates
}

export function LiveResults({ initial, lng, agents }: { initial: MatchRow[]; lng: string; agents: Record<number, AgentRow> }) {
  const { client } = useSupabase();
  const [items, setItems] = useState<MatchRow[]>(initial);
  const seenIds = useRef<Set<number>>(new Set(initial.map((r) => r.id)));
  const { t } = useTranslation();

  useEffect(() => {
    const channel = client
      .channel("realtime-matches")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "matches" },
        (payload: RealtimePostgresInsertPayload<MatchRow>) => {
          const row = payload.new as unknown as MatchRow;
          if (!row || !row.id || !isFinished(row)) return;
          if (seenIds.current.has(row.id)) return;
          seenIds.current.add(row.id);
          setItems((prev) => [row, ...prev].slice(0, 100));
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "matches" },
        (payload: RealtimePostgresUpdatePayload<MatchRow>) => {
          const row = payload.new as unknown as MatchRow;
          if (!row || !row.id || !isFinished(row)) return;
          setItems((prev) => {
            const exists = prev.findIndex((r) => r.id === row.id);
            if (exists >= 0) {
              const copy = prev.slice();
              copy[exists] = row;
              return copy;
            }
            if (!seenIds.current.has(row.id)) {
              seenIds.current.add(row.id);
              return [row, ...prev].slice(0, 100);
            }
            return prev;
          });
        },
      )
      .subscribe();

    return () => {
      void client.removeChannel(channel);
    };
  }, [client]);

  const rows = useMemo(() => items, [items]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">{t("results.latestTitle")}</h2>
        <span className="text-sm opacity-70">{t("results.countShown", { count: rows.length })}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="table table-zebra w-full text-center min-w-max">
          <thead>
            <tr>
              <th className="text-center">{t("results.headers.id")}</th>
              <th className="text-center">{t("results.headers.white")}</th>
              <th className="text-center">{t("results.headers.black")}</th>
              <th className="text-center">{t("results.headers.round")}</th>
              <th className="text-center">{t("results.headers.result")}</th>
              <th className="text-center">{t("results.headers.pgn")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => (
              <tr key={m.id}>
                <td className="whitespace-nowrap text-center">{m.id}</td>
                <td className="text-center">
                  <a className="link link-primary" href={`/${lng}/results/player/${m.player_white}`}>
                    {agents[m.player_white] ? (
                      <AgentLabel agent={agents[m.player_white]} />
                    ) : (
                      <span className="font-mono">{m.player_white}</span>
                    )}
                  </a>
                </td>
                <td className="text-center">
                  <a className="link link-primary" href={`/${lng}/results/player/${m.player_black}`}>
                    {agents[m.player_black] ? (
                      <AgentLabel agent={agents[m.player_black]} />
                    ) : (
                      <span className="font-mono">{m.player_black}</span>
                    )}
                  </a>
                </td>
                <td className="text-center">
                  {m.round != null ? (
                    <a className="link link-primary" href={`/${lng}/results/round/${m.round}`}>
                      {m.round}
                    </a>
                  ) : (
                    "-"
                  )}
                </td>
                <td className="text-center font-medium">{m.result}</td>
                <td className="text-center">
                  <a className="link link-primary" href={`/${lng}/results/game/${m.id}`}>
                    {m.id}
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

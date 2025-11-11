"use client";

// Player Results (client): shows live-updating results for a single player.
// Only rows including the target player are shown; agent labels are fetched
// lazily to avoid flashing numeric IDs.

import { useEffect, useMemo, useRef, useState } from "react";
import { useSupabase } from "@/components/supabase-provider";
import { useTranslation } from "react-i18next";
import type { AgentRow } from "@/components/agents/agent-utils";
import { AgentLabel } from "@/components/agents/agent-label";
import Link from "next/link";

export type PlayerMatchRow = {
  id: number;
  created_at: string;
  player_white: number;
  player_black: number;
  round: number | null;
  championship_id: number;
  result: string | null;
};

function isFinished(row: PlayerMatchRow) {
  return Boolean(row.result);
}

// Page sizes consistent with /results/all
const ALLOWED_PAGE_SIZES = [30, 50, 100] as const;

export function PlayerResultsLive({
  initial,
  playerId,
  lng,
  agents,
  perPage,
  page,
  total,
}: {
  initial: PlayerMatchRow[];
  playerId: number;
  lng: string;
  agents: Record<number, AgentRow>;
  perPage: number;
  page: number;
  total: number;
}) {
  const { client } = useSupabase();
  const [items, setItems] = useState<PlayerMatchRow[]>(initial);
  // Local cache for agent metadata so labels render promptly when available.
  const [agentMap, setAgentMap] = useState<Record<number, AgentRow>>(agents);
  const agentMapRef = useRef<Record<number, AgentRow>>(agents);
  const seenIds = useRef<Set<number>>(new Set(initial.map((r) => r.id)));
  const { t } = useTranslation();

  useEffect(() => {
    setAgentMap(agents);
    agentMapRef.current = agents;
  }, [agents]);

  // Subscribe to player-specific realtime events and cap list length.
  useEffect(() => {
    const channel = client
      .channel(`realtime-player-${playerId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "matches" }, (payload) => {
        const row = payload.new as PlayerMatchRow;
        if (!row || !isFinished(row)) return;
        if (row.player_white !== playerId && row.player_black !== playerId) return;
        if (!seenIds.current.has(row.id)) {
          seenIds.current.add(row.id);
          setTotalCount((c) => c + 1);
          if (page === 1) {
            setItems((prev) => [row, ...prev].slice(0, perPage));
          }
        }
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "matches" }, (payload) => {
        const row = payload.new as PlayerMatchRow;
        if (!row || !isFinished(row)) return;
        if (row.player_white !== playerId && row.player_black !== playerId) return;
        if (page === 1) {
          setItems((prev) => {
            const idx = prev.findIndex((r) => r.id === row.id);
            if (idx >= 0) {
              const next = prev.slice();
              next[idx] = row;
              return next;
            }
            if (!seenIds.current.has(row.id)) {
              seenIds.current.add(row.id);
              return [row, ...prev].slice(0, perPage);
            }
            return prev;
          });
        }
      })
      .subscribe();

    return () => {
      void client.removeChannel(channel);
    };
  }, [client, playerId]);

  const rows = useMemo(() => items, [items]);

  const [totalCount, setTotalCount] = useState<number>(total);

  // Reset local cache when server-provided slice changes
  useEffect(() => {
    setItems(initial);
    seenIds.current = new Set(initial.map((r) => r.id));
    setTotalCount(total);
    setAgentMap(agents);
    agentMapRef.current = agents;
  }, [initial, total, perPage, page, agents]);

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

  // Pagination helpers
  const totalPages = Math.max(1, Math.ceil(totalCount / perPage));
  const prevPage = page > 1 ? page - 1 : null;
  const nextPage = page < totalPages ? page + 1 : null;

  function linkFor(p?: number | null, ps?: number) {
    return {
      pathname: `/${lng}/results/player/${playerId}`,
      query: {
        page: String(p ?? page),
        perPage: String(ps ?? perPage),
      },
    } as const;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm">
        <span>{t("results.perPage")}</span>
        {ALLOWED_PAGE_SIZES.map((ps) => (
          <Link
            key={ps}
            href={linkFor(1, ps)}
            aria-current={ps === perPage ? "page" : undefined}
            className={`btn btn-xs ${ps === perPage ? "btn-primary" : "btn-ghost"}`}
          >
            {ps}
          </Link>
        ))}
        <span className="badge badge-outline">{perPage}</span>
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
                    {t("viewer.pgn")} #{m.id}
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between">
        <Link
          className={`btn ${prevPage ? "btn-outline" : "btn-disabled"}`}
          aria-disabled={!prevPage}
          href={prevPage ? linkFor(prevPage) : { pathname: `/${lng}/results/player/${playerId}`, query: { page: String(page), perPage: String(perPage) } }}
        >
          {t("results.previous")}
        </Link>
        <div className="text-sm opacity-70">{t("results.pageStatus", { page, totalPages, total: totalCount })}</div>
        <Link
          className={`btn ${nextPage ? "btn-outline" : "btn-disabled"}`}
          aria-disabled={!nextPage}
          href={nextPage ? linkFor(nextPage) : { pathname: `/${lng}/results/player/${playerId}`, query: { page: String(page), perPage: String(perPage) } }}
        >
          {t("results.next")}
        </Link>
      </div>
    </div>
  );
}

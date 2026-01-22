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
  champId,
  championships,
}: {
  initial: PlayerMatchRow[];
  playerId: number;
  lng: string;
  agents: Record<number, AgentRow>;
  perPage: number;
  page: number;
  total: number;
  champId: number | null;
  championships: Array<{ id: number; status?: string | null; start_date?: string | null }>;
}) {
  const { client } = useSupabase();
  const [items, setItems] = useState<PlayerMatchRow[]>(initial);
  // Local cache for agent metadata so labels render promptly when available.
  const [agentMap, setAgentMap] = useState<Record<number, AgentRow>>(agents);
  const agentMapRef = useRef<Record<number, AgentRow>>(agents);
  const seenIds = useRef<Set<number>>(new Set(initial.map((r) => r.id)));
  const { t } = useTranslation();
  const [champSelector, setChampSelector] = useState<number | null>(champId);
  const hasAppliedStoredChamp = useRef(false);

  useEffect(() => {
    setAgentMap(agents);
    agentMapRef.current = agents;
  }, [agents]);

  // Subscribe to player-specific realtime events and cap list length.
  useEffect(() => {
    const channel = client
      .channel(`realtime-player-${playerId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "sf_matches" }, (payload) => {
        const row = payload.new as PlayerMatchRow;
        if (!row || !isFinished(row)) return;
        if (champId && row.championship_id !== champId) return;
        if (row.player_white !== playerId && row.player_black !== playerId) return;
        if (!seenIds.current.has(row.id)) {
          seenIds.current.add(row.id);
          setTotalCount((c) => c + 1);
          if (page === 1) {
            setItems((prev) => [row, ...prev].slice(0, perPage));
          }
        }
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "sf_matches" }, (payload) => {
        const row = payload.new as PlayerMatchRow;
        if (!row || !isFinished(row)) return;
        if (champId && row.championship_id !== champId) return;
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
  }, [client, playerId, champId]);

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

  useEffect(() => {
    setChampSelector(champId);
  }, [champId]);

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
          .from("sf_agents")
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
  const champQuery = champId ? `?champ=${champId}` : "";

  function linkFor(p?: number | null, ps?: number) {
    return {
      pathname: `/${lng}/results/player/${playerId}`,
      query: {
        page: String(p ?? page),
        perPage: String(ps ?? perPage),
        ...(champId ? { champ: String(champId) } : {}),
      },
    } as const;
  }

  useEffect(() => {
    if (hasAppliedStoredChamp.current) return;
    hasAppliedStoredChamp.current = true;
    if (!championships.length) return;
    const stored = sessionStorage.getItem("resultsChampId");
    const parsed = stored ? parseInt(stored, 10) : NaN;
    const exists = championships.some((c) => c.id === parsed);
    if (exists && parsed !== champId) {
      const params = new URLSearchParams(window.location.search);
      params.set("champ", String(parsed));
      params.set("page", "1");
      const next = `${window.location.pathname}?${params.toString()}`;
      window.history.replaceState(null, "", next);
      window.location.href = next;
    }
  }, [champId, championships]);

  function handleChampChange(value: string) {
    const nextId = parseInt(value, 10);
    if (!Number.isFinite(nextId)) return;
    sessionStorage.setItem("resultsChampId", String(nextId));
    setChampSelector(nextId);
    const params = new URLSearchParams(window.location.search);
    params.set("champ", String(nextId));
    params.set("page", "1");
    const next = `${window.location.pathname}?${params.toString()}`;
    window.history.replaceState(null, "", next);
    window.location.href = next;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <div className="flex items-center gap-2">
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
        <div className="flex items-center gap-2">
          <span className="label-text text-xs opacity-70">
            {t("standings.championshipLabel", { defaultValue: "Championship" })}:
          </span>
          <select
            className="select select-bordered select-xs w-16"
            value={champSelector ?? ""}
            onChange={(e) => handleChampChange(e.target.value)}
            disabled={!championships.length}
          >
            {!championships.length ? (
              <option value="">
                {t("standings.noChampionships", { defaultValue: "No championships available" })}
              </option>
            ) : null}
            {championships.map((c) => {
              const label = String(c.id);
              return (
                <option key={c.id} value={c.id}>
                  {label}
                </option>
              );
            })}
          </select>
        </div>
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
                  <a className="link link-primary" href={`/${lng}/results/player/${m.player_white}${champQuery}`}>
                    {agentMap[m.player_white] ? (
                      <AgentLabel agent={agentMap[m.player_white]} />
                    ) : (
                      <span className="opacity-60">…</span>
                    )}
                  </a>
                </td>
                <td className="text-center">
                  <a className="link link-primary" href={`/${lng}/results/player/${m.player_black}${champQuery}`}>
                    {agentMap[m.player_black] ? (
                      <AgentLabel agent={agentMap[m.player_black]} />
                    ) : (
                      <span className="opacity-60">…</span>
                    )}
                  </a>
                </td>
                <td className="text-center">
                  {m.round != null ? (
                    <a className="link link-primary" href={`/${lng}/results/round/${m.round}${champQuery}`}>
                      {m.round}
                    </a>
                  ) : (
                    "-"
                  )}
                </td>
                <td className="text-center font-medium">{m.result}</td>
                <td className="text-center">
                  <a className="link link-primary" href={`/${lng}/results/game/${m.id}${champQuery}`}>
                    {t("viewer.pgn")} #{m.id}
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-center">
        <div className="flex items-center justify-center gap-2 flex-wrap">
          <Link
            className={`btn btn-sm ${page === 1 ? "btn-disabled" : "btn-outline"}`}
            aria-disabled={page === 1}
            href={page === 1 ? linkFor(page) : linkFor(1)}
          >
            {t("results.first", { defaultValue: "First" })}
          </Link>
          <Link
            className={`btn btn-sm ${!prevPage ? "btn-disabled" : "btn-outline"}`}
            aria-disabled={!prevPage}
            href={!prevPage ? linkFor(page) : linkFor(prevPage)}
          >
            {t("results.previous")}
          </Link>
          <span className="px-3 py-1 text-sm rounded-md bg-base-200">
            {t("results.pageStatus", { page, totalPages, total: totalCount })}
          </span>
          <Link
            className={`btn btn-sm ${!nextPage ? "btn-disabled" : "btn-outline"}`}
            aria-disabled={!nextPage}
            href={!nextPage ? linkFor(page) : linkFor(nextPage)}
          >
            {t("results.next")}
          </Link>
          <Link
            className={`btn btn-sm ${page === totalPages ? "btn-disabled" : "btn-outline"}`}
            aria-disabled={page === totalPages}
            href={page === totalPages ? linkFor(page) : linkFor(totalPages)}
          >
            {t("results.last", { defaultValue: "Last" })}
          </Link>
        </div>
      </div>
    </div>
  );
}

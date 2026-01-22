"use client";

// Round Results (client): shows live-updating results for a single round.
// Matches are filtered by round id and updated in place from realtime events.
// Agent labels are fetched on-demand to avoid showing numeric IDs.

import { useEffect, useMemo, useRef, useState } from "react";
import { useSupabase } from "@/components/supabase-provider";
import Link from "next/link";
import { useTranslation } from "react-i18next";
import type { AgentRow } from "@/components/agents/agent-utils";
import { AgentLabel } from "@/components/agents/agent-label";
import { RoundJump } from "@/components/results/round-jump";

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
  perPage,
  page,
  total,
  agents,
  scope,
  champId,
  championships,
  favoriteIds = [],
  favoritesOnly = false,
  showFavoritesToggle = false,
}: {
  initial: RoundMatchRow[];
  roundId: number;
  lng: string;
  perPage: number;
  page: number;
  total: number;
  agents: Record<number, AgentRow>;
  scope: "latest" | "all";
  champId: number | null;
  championships: Array<{ id: number; status?: string | null; start_date?: string | null }>;
  favoriteIds?: number[];
  favoritesOnly?: boolean;
  showFavoritesToggle?: boolean;
}) {
  const { client } = useSupabase();
  const [items, setItems] = useState<RoundMatchRow[]>(initial);
  // Local cache for agent metadata so labels render promptly when available.
  const [agentMap, setAgentMap] = useState<Record<number, AgentRow>>(agents);
  const agentMapRef = useRef<Record<number, AgentRow>>(agents);
  const seenIds = useRef<Set<number>>(new Set(initial.map((r) => r.id)));
  const { t } = useTranslation();
  const [champSelector, setChampSelector] = useState<number | null>(champId);
  const hasAppliedStoredChamp = useRef(false);
  const favSet = useMemo(() => new Set<number>(favoriteIds), [favoriteIds]);
  const favoriteLabel = t("dashboard.favorites", { defaultValue: "Favorites" });
  const favoritesEmptyLabel = t("dashboard.favoritesEmpty", {
    defaultValue: "No favorites yet. Browse positions to add some.",
  });

  // Keep local agent map in sync
  useEffect(() => {
    setAgentMap(agents);
    agentMapRef.current = agents;
  }, [agents]);

  // Subscribe to realtime INSERT/UPDATE for matches and keep only those that
  // belong to the selected round. Maintain only page 1 in place to preserve pagination.
  useEffect(() => {
    const channel = client
      .channel(`realtime-round-${roundId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "sf_matches" }, (payload) => {
        const row = payload.new as RoundMatchRow;
        if (!row || !isFinished(row)) return;
        if (champId && row.championship_id !== champId) return;
        if (row.round !== roundId) return;
        if (favoritesOnly && !favSet.has(row.player_white) && !favSet.has(row.player_black)) return;
        if (seenIds.current.has(row.id)) return;
        seenIds.current.add(row.id);
        if (page === 1) {
          setItems((prev) => [row, ...prev].slice(0, perPage));
        }
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "sf_matches" }, (payload) => {
        const row = payload.new as RoundMatchRow;
        if (!row || !isFinished(row)) return;
        if (champId && row.championship_id !== champId) return;
        if (row.round !== roundId) return;
        if (page === 1) {
          setItems((prev) => {
            const idx = prev.findIndex((r) => r.id === row.id);
            if (idx >= 0) {
              const next = prev.slice();
              next[idx] = row;
              return next;
            }
            if (favoritesOnly && !favSet.has(row.player_white) && !favSet.has(row.player_black)) {
              return prev;
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
  }, [client, roundId, perPage, page, champId, favoritesOnly, favSet]);

  const rows = useMemo(() => items, [items]);

  // Reset local cache when server-provided slice changes (page/perPage change or hard refresh).
  useEffect(() => {
    setItems(initial);
    seenIds.current = new Set(initial.map((r) => r.id));
    setAgentMap(agents);
    agentMapRef.current = agents;
  }, [initial, agents, page, perPage]);

  useEffect(() => {
    setChampSelector(champId);
  }, [champId]);

  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const prevPage = page > 1 ? page - 1 : null;
  const nextPage = page < totalPages ? page + 1 : null;

  function linkFor(p?: number | null, ps?: number, nextFavoritesOnly?: boolean) {
    const useFavorites = typeof nextFavoritesOnly === "boolean" ? nextFavoritesOnly : favoritesOnly;
    return {
      pathname: `/${lng}/results/round/${roundId}`,
      query: {
        page: String(p ?? page),
        perPage: String(ps ?? perPage),
        scope: scope === "all" ? "all" : undefined,
        ...(champId ? { champ: String(champId) } : {}),
        ...(useFavorites ? { favorites: "1" } : {}),
      },
    } as const;
  }

  const champQuery = champId ? `?champ=${champId}` : "";
  const scopeLatestLink = {
    pathname: `/${lng}/results/round/${roundId}`,
    query: {
      ...(champId ? { champ: String(champId) } : {}),
      ...(favoritesOnly ? { favorites: "1" } : {}),
    },
  } as const;
  const scopeAllLink = {
    pathname: `/${lng}/results/round/${roundId}`,
    query: {
      scope: "all",
      ...(champId ? { champ: String(champId) } : {}),
      ...(favoritesOnly ? { favorites: "1" } : {}),
    },
  } as const;

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

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        {showFavoritesToggle ? (
          <Link
            className={`btn btn-sm ${favoritesOnly ? "btn-primary" : "btn-outline"}`}
            href={linkFor(1, perPage, !favoritesOnly)}
          >
            {favoriteLabel}
          </Link>
        ) : null}
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
        <RoundJump
          lng={lng}
          scope={scope}
          champId={champId}
          favoritesOnly={favoritesOnly}
          initialRound={roundId}
        />
      </div>
      <div className="text-sm opacity-70">{t("results.countShown", { count: rows.length })}</div>
      <div className="flex items-center gap-2 text-sm">
        <span>{t("results.scopeLabel")}</span>
        <Link
          href={scopeLatestLink}
          className={`btn btn-xs ${scope === "latest" ? "btn-primary" : "btn-ghost"}`}
        >
          {t("results.scopeLatest")}
        </Link>
        <Link
          href={scopeAllLink}
          className={`btn btn-xs ${scope === "all" ? "btn-primary" : "btn-ghost"}`}
        >
          {t("results.scopeAll")}
        </Link>
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
            {rows.length === 0 ? (
              <tr>
                <td className="text-center py-6 opacity-70" colSpan={5}>
                  {favoritesOnly
                    ? favoritesEmptyLabel
                    : t("positions.empty", { defaultValue: "No positions to display" })}
                </td>
              </tr>
            ) : null}
            {rows.map((m) => (
              <tr key={m.id}>
                <td className="text-center">
                  <a className="link link-primary" href={`/${lng}/results/player/${m.player_white}${champQuery}`}>
                    {agentMap[m.player_white] ? (
                      <AgentLabel agent={agentMap[m.player_white]} isFavorited={favSet.has(m.player_white)} />
                    ) : (
                      <span className="opacity-60">…</span>
                    )}
                  </a>
                </td>
                <td className="text-center">
                  <a className="link link-primary" href={`/${lng}/results/player/${m.player_black}${champQuery}`}>
                    {agentMap[m.player_black] ? (
                      <AgentLabel agent={agentMap[m.player_black]} isFavorited={favSet.has(m.player_black)} />
                    ) : (
                      <span className="opacity-60">…</span>
                    )}
                  </a>
                </td>
                <td className="text-center">
                  <a className="link link-primary" href={`/${lng}/results/round/${m.round ?? ""}${champQuery}`}>
                    {m.round ?? "-"}
                  </a>
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
            href={page === 1 ? linkFor(page, perPage) : linkFor(1, perPage)}
          >
            {t("results.first", { defaultValue: "First" })}
          </Link>
          <Link
            className={`btn btn-sm ${!prevPage ? "btn-disabled" : "btn-outline"}`}
            aria-disabled={!prevPage}
            href={!prevPage ? linkFor(page, perPage) : linkFor(prevPage, perPage)}
          >
            {t("results.previous")}
          </Link>
          <span className="px-3 py-1 text-sm rounded-md bg-base-200">
            {t("results.pageStatus", { page, totalPages, total })}
          </span>
          <Link
            className={`btn btn-sm ${!nextPage ? "btn-disabled" : "btn-outline"}`}
            aria-disabled={!nextPage}
            href={!nextPage ? linkFor(page, perPage) : linkFor(nextPage, perPage)}
          >
            {t("results.next")}
          </Link>
          <Link
            className={`btn btn-sm ${page === totalPages ? "btn-disabled" : "btn-outline"}`}
            aria-disabled={page === totalPages}
            href={page === totalPages ? linkFor(page, perPage) : linkFor(totalPages, perPage)}
          >
            {t("results.last", { defaultValue: "Last" })}
          </Link>
        </div>
      </div>
    </div>
  );
}

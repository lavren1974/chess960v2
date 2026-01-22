"use client";

// All Results (client): renders a paginated, live-updating table of finished
// matches. The server provides the initial slice; the client subscribes to
// realtime INSERT/UPDATE events and updates page 1 in place. Agent labels are
// displayed using `AgentLabel`, and missing agent rows are fetched lazily to
// avoid flicker (showing a subtle placeholder until data arrives).

import { useEffect, useMemo, useRef, useState } from "react";
import { useSupabase } from "@/components/supabase-provider";
import type { MatchRow } from "@/components/results/live-results";
import { useTranslation } from "react-i18next";
import Link from "next/link";
import type { AgentRow } from "@/components/agents/agent-utils";
import { AgentLabel } from "@/components/agents/agent-label";

// Keep pagination sizes explicit to control server load and UX.
const ALLOWED_PAGE_SIZES = [50, 100, 1000] as const;

// Guard for rows that represent completed games.
function isFinished(row: MatchRow) {
  return Boolean(row.result);
}

function isFavoriteMatch(row: MatchRow, favSet: Set<number>) {
  return favSet.has(row.player_white) || favSet.has(row.player_black);
}

export function AllResultsLive({
  initial,
  lng,
  perPage,
  page,
  hasNext,
  agents,
  favoriteIds = [],
  champId,
  championships,
  favoritesOnly = false,
  showFavoritesToggle = false,
}: {
  initial: MatchRow[];
  lng: string;
  perPage: number;
  page: number;
  hasNext: boolean;
  agents: Record<number, AgentRow>;
  favoriteIds?: number[];
  champId: number | null;
  championships: Array<{ id: number; status?: string | null; start_date?: string | null }>;
  favoritesOnly?: boolean;
  showFavoritesToggle?: boolean;
}) {
  const { client } = useSupabase();
  const { t } = useTranslation();
  // Items shown in the table; seeded from the server slice.
  const [items, setItems] = useState<MatchRow[]>(initial);
  // Cache of agent metadata for labels; seeded from server.
  const [agentMap, setAgentMap] = useState<Record<number, AgentRow>>(agents);
  const [hasNextPage, setHasNextPage] = useState<boolean>(hasNext);
  const seenIds = useRef<Set<number>>(new Set(initial.map((r) => r.id)));
  const agentMapRef = useRef<Record<number, AgentRow>>(agents);
  const [champSelector, setChampSelector] = useState<number | null>(champId);
  const hasAppliedStoredChamp = useRef(false);
  const favSet = useMemo(() => new Set<number>(favoriteIds), [favoriteIds]);

  // Keep internal ref in sync to avoid stale closures inside handlers.
  useEffect(() => {
    agentMapRef.current = agentMap;
  }, [agentMap]);

  // Realtime subscription: listen for new/updated matches. Only page 1 is
  // updated in place to preserve paging invariants.
  useEffect(() => {
    const channel = client
      .channel("realtime-results-all")
      .on("postgres_changes", { event: "*", schema: "public", table: "sf_matches" }, (payload) => {
        // We only update page 1 in place.
        if (page !== 1) return;

        const row = (payload.new || payload.old) as MatchRow;
        if (!row || !isFinished(row)) return;
        if (champId && row.championship_id !== champId) return;
        if (favoritesOnly && !isFavoriteMatch(row, favSet)) {
          if (payload.eventType === "DELETE" && seenIds.current.has(row.id)) {
            setItems((prev) => prev.filter((r) => r.id !== row.id));
            seenIds.current.delete(row.id);
          }
          return;
        }

        if (payload.eventType === "DELETE") {
          if (seenIds.current.has(row.id)) {
            setItems((prev) => prev.filter((r) => r.id !== row.id));
            seenIds.current.delete(row.id);
          }
        } else {
          // This handles both INSERT and UPDATE
          setItems((prev) => {
            const idx = prev.findIndex((r) => r.id === row.id);
            if (idx !== -1) {
              const next = [...prev];
              next[idx] = row;
              return next;
            }
            // If it's a new row, add it to the top.
            if (!seenIds.current.has(row.id)) {
              seenIds.current.add(row.id);
              if (page === 1 && prev.length >= perPage) {
                setHasNextPage(true);
              }
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
  }, [client, page, perPage, champId, favoritesOnly, favSet]);

  // Reset local cache when server-provided slice changes (page/perPage change
  // or hard refresh). Also sync total and agent map.
  useEffect(() => {
    setItems(initial);
    seenIds.current = new Set(initial.map((r) => r.id));
    setHasNextPage(hasNext);
    agentMapRef.current = agents;
    setAgentMap(agents);
  }, [initial, hasNext, perPage, page, agents]);

  useEffect(() => {
    setChampSelector(champId);
  }, [champId]);

  // Re-fetch any missing agents for the current page immediately on page change.
  useEffect(() => {
    const missing = new Set<number>();
    for (const m of initial) {
      if (!agents[m.player_white]) missing.add(m.player_white);
      if (!agents[m.player_black]) missing.add(m.player_black);
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
  }, [initial, agents, client]);

  // Ensure agent details are available for all rows in view. Fetch any missing
  // agents in small batches to avoid URL-length limits and rate spikes.
  useEffect(() => {
    const missing = new Set<number>();
    for (const m of items) {
      if (!agentMap[m.player_white]) missing.add(m.player_white);
      if (!agentMap[m.player_black]) missing.add(m.player_black);
    }
    if (missing.size === 0) return;
    const CHUNK = 200;
    const ids = Array.from(missing);
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
            for (const a of data as unknown as AgentRow[]) next[a.id] = a as AgentRow;
            return next;
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [items, client, agentMap]);

  const rows = useMemo(() => items, [items]);
  const champQuery = champId ? `?champ=${champId}` : "";
  const favoriteLabel = t("dashboard.favorites", { defaultValue: "Favorites" });
  const favoritesEmptyLabel = t("dashboard.favoritesEmpty", {
    defaultValue: "No favorites yet. Browse positions to add some.",
  });

  const prevPage = page > 1 ? page - 1 : null;
  const nextPage = hasNextPage ? page + 1 : null;

  function linkFor(p?: number | null, ps?: number, nextFavoritesOnly?: boolean) {
    const useFavorites = typeof nextFavoritesOnly === "boolean" ? nextFavoritesOnly : favoritesOnly;
    return {
      pathname: `/${lng}/results/all`,
      query: {
        page: String(p ?? page),
        perPage: String(ps ?? perPage),
        ...(champId ? { champ: String(champId) } : {}),
        ...(useFavorites ? { favorites: "1" } : {}),
      },
    } as const;
  }

  useEffect(() => {
    // Apply stored championship selection once per session if present
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
        {showFavoritesToggle ? (
          <Link
            className={`btn btn-sm ${favoritesOnly ? "btn-primary" : "btn-outline"}`}
            href={linkFor(1, perPage, !favoritesOnly)}
          >
            {favoriteLabel}
          </Link>
        ) : null}
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
            className={`btn btn-sm ${!prevPage ? "btn-disabled" : "btn-outline"}`}
            aria-disabled={!prevPage}
            href={!prevPage ? linkFor(page, perPage) : linkFor(prevPage, perPage)}
          >
            {t("results.previous")}
          </Link>
          <Link
            className={`btn btn-sm ${!nextPage ? "btn-disabled" : "btn-outline"}`}
            aria-disabled={!nextPage}
            href={!nextPage ? linkFor(page, perPage) : linkFor(nextPage, perPage)}
          >
            {t("results.next")}
          </Link>
        </div>
      </div>
    </div>
  );
}
